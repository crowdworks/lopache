(function() {
    'use strict';

    var NestedError = require('nested-error-stacks'),
        util = require('util'),
        EventEmitter = require('events').EventEmitter;

    var Definition = function Definition(name, deps, func, instantiate) {
        this.name = name;
        this.deps = deps;
        this.func = func;
        this.instantiate = Definition.InstantiationStrategies[instantiate];
    };

    Definition.InstantiationStrategies = {
        ctor: function(Ctor) { return new Ctor(); },
        func: function(func) { return func(); }
    };

    Definition.prototype.buildInjectsParams = function(context) {
        return [this.deps, this.func].concat([context]);
    };

    Definition.prototype.instantiate = function(injected) {
        return this.instantiate(injected);
    };

    var Injector = function Injector(dependencies, definitions) {
        this.dependencies = dependencies || {};
        this.definitions = definitions || {};
    };

    util.inherits(Injector, EventEmitter);

    Injector.prototype.define = function(name, deps, func, instantiate) {
        instantiate = instantiate || 'ctor';

        this.setDefinition(name, new Definition(name, deps, func, instantiate));
    };

    Injector.prototype.build = function(name, context) {
        var contextWithDefaults = this.contextWithDefaults(context);
        var definition = this.getDefinition(name);
        if (definition) {
            var injected = this.inject.apply(this, definition.buildInjectsParams(contextWithDefaults));
            var component;

            try {
                component = definition.instantiate(injected);
            } catch (e) {
                throw new NestedError('Failed to instantiate: ' + name, e);
            }

            this.emit('created', component);

            return component;
        } else {
            throw new Error('Can\'t instantiate ' + name);
        }
    };

    Injector.prototype.create = function(name, context) {
        var component = this.build(name, context);

        this.register(name, component);

        return component;
    };

    Injector.prototype.getDependency = function getDependency(name) {
        return this.dependencies[name];
    };

    Injector.prototype.getDefinition = function getDefinition(name) {
        return this.definitions[name];
    };

    Injector.prototype.setDependency = function setDependency(name, dep) {
        this.dependencies[name] = dep;
    };

    Injector.prototype.setDefinition = function setDefinition(name, definition) {
        this.definitions[name] = definition;
    };

    Injector.prototype.register = function(name, component) {
        if (this.getDependency(name)) {
            throw new Error(name + " is already registered.");
        }

        this.setDependency(name, component);
    };

    Injector.prototype.resolve = function(name, context) {
        var contextWithDefaults = this.contextWithDefaults(context);
        var dep;

        if (contextWithDefaults.unresolved[name]) {
            throw new Error('Cyclic dependency from and to ' + name + ' detected');
        } else {
            contextWithDefaults.unresolved[name] = true;
        }

        if (this.getDependency(name)) {
            dep = this.getDependency(name);
        } else {
            try {
                dep = this.create(name, contextWithDefaults);
            } catch(e) {
                throw new NestedError('Can\'t resolve ' + name, e);
            }
        }
        return dep;
    };

    Injector.prototype.inject = function(deps, func, context) {
        var contextWithDefaults = this.contextWithDefaults(context);
        var args = [];
        for (var i=0; i<deps.length; i++) {
            var d = deps[i];
            try {
                args.push(this.resolve(d, contextWithDefaults));
            } catch(e) {
                var msg = 'Failed injecting: ' + deps + ': registered dependencies are: ' + this.getDependencyNames();
                throw new NestedError(msg, e);
            }
        }
        // To support injection to ctors,
        return function() {
            // we inherit the prototype of the original ctor and
            if (typeof this !== 'undefined') {
                this.__proto__ = func.prototype;
            }

            // bind arguments to the ctor
            return func.apply(this, args.concat(Array.prototype.slice.call(arguments, 0)));
        };
    };

    Injector.prototype.contextWithDefaults = function(context) {
        return context || { unresolved: {} };
    };

    Injector.prototype.getDependencyNames = function getDependencyNames() {
        return this.dependencies ? Object.keys(this.dependencies) : [];
    };

    Injector.prototype.mergeDependencies = function mergeDependencies(mergedDeps) {
        return new InjectorWithOverrodeDependencies(this, mergedDeps);
    };

    var InjectorWithOverrodeDependencies = function InjectorWithOverrodeDependencies(injector, overrodeDependencies) {
        this.injector = injector;
        this.overrodeDependencies = overrodeDependencies;
    };

    util.inherits(InjectorWithOverrodeDependencies, Injector);

    InjectorWithOverrodeDependencies.prototype.getDependencyNames = function getDependencies() {
        var a = InjectorWithOverrodeDependencies.super_.prototype.getDependencyNames.apply(this.injector);
        var b = this.overrodeDependencies ? Object.keys(this.overrodeDependencies) : [];

        return a.concat(b);
    };

    InjectorWithOverrodeDependencies.prototype.getDependency = function getDependency(name) {
        return this.overrodeDependencies[name] || this.injector.getDependency(name);
    };

    InjectorWithOverrodeDependencies.prototype.on = function on(eventName, callback) {
        return this.injector.on(eventName, callback);
    };

    InjectorWithOverrodeDependencies.prototype.emit = function emit() {
        return this.injector.emit.apply(this.injector, Array.prototype.slice.call(arguments));
    };

    InjectorWithOverrodeDependencies.prototype.getDefinition = function getDefinition(name) {
        return this.overrodeDependencies[name] || this.injector.getDefinition(name);
    };

    InjectorWithOverrodeDependencies.prototype.setDependency = function setDependency(name, dep) {
        this.injector.setDependency(name, dep);
    };

    InjectorWithOverrodeDependencies.prototype.setDefinition = function setDefinition(name, definition) {
        this.injector.setDefinition(definition);
    };

    module.exports = { Injector: Injector };
})();
