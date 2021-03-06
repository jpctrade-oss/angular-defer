
(function() {
	'use strict';
	var regModules = ['ng'],
		initModules = [],
		regInvokes = {},
		regConfigs = [],
		justLoaded = [],
		runBlocks = {},
		ocLazyLoad = angular.module('oc.lazyLoad', ['ng']),
		broadcast = angular.noop;
	function forEachArray(arr, fn, context) {
		if (!arr) { return; }
		if (arr.forEach) {
			return arr.forEach(fn);
		}
		for (var i = 0, l = arr.length; i < l; i++) {
			fn.call(context, arr[i], i);
		}
	}
	ocLazyLoad.provider('$ocLazyLoad', ['$controllerProvider', '$provide', '$compileProvider', '$filterProvider', '$injector', '$animateProvider',
		function($controllerProvider, $provide, $compileProvider, $filterProvider, $injector, $animateProvider) {
			var modules = {},
				providers = {
					$controllerProvider: $controllerProvider,
					$compileProvider: $compileProvider,
					$filterProvider: $filterProvider,
					$provide: $provide, // other things
					$injector: $injector,
					$animateProvider: $animateProvider
				},
				anchor = document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0],
				jsLoader, cssLoader, templatesLoader,
				debug = false,
				events = false;
			this.$get = ['$log', '$q', '$templateCache', '$http', '$rootElement', '$rootScope', '$cacheFactory', '$interval', function($log, $q, $templateCache, $http, $rootElement, $rootScope, $cacheFactory, $interval) {
				var instanceInjector,
					filesCache = $cacheFactory('ocLazyLoad'),
					uaCssChecked = false,
					useCssLoadPatch = false;
				if(!debug) {
					$log = {};
					$log.error = angular.noop;
					$log.warn = angular.noop;
					$log.info = angular.noop;
				}
				providers.getInstanceInjector = function() {
					return (instanceInjector) ? instanceInjector : (instanceInjector = ($rootElement.data('$injector') || angular.injector()));
				};
				broadcast = function broadcast(eventName, params) {
					if(events) {
						$rootScope.$broadcast(eventName, params);
					}
					if(debug) {
						$log.info(eventName, params);
					}
				};
				var buildElement = function buildElement(type, path, params) {
					var deferred = $q.defer(),
						el, loaded,
						cacheBuster = function cacheBuster(url) {
							var dc = new Date().getTime();
							if(url.indexOf('?') >= 0) {
								if(url.substring(0, url.length - 1) === '&') {
									return url + '_dc=' + dc;
								}
								return url + '&_dc=' + dc;
							} else {
								return url + '?_dc=' + dc;
							}
						};
					if(angular.isUndefined(filesCache.get(path))) {
						filesCache.put(path, deferred.promise);
					}
					switch(type) {
						case 'css':
							el = document.createElement('link');
							el.type = 'text/css';
							el.rel = 'stylesheet';
							el.href = params.cache === false ? cacheBuster(path) : path;
							break;
						case 'js':
							el = document.createElement('script');
							el.src = params.cache === false ? cacheBuster(path) : path;
							break;
						default:
							deferred.reject(new Error('Requested type "' + type + '" is not known. Could not inject "' + path + '"'));
							break;
					}
					el.onload = el.onreadystatechange = function() {
						if((el['readyState'] && !(/^c|loade/.test(el['readyState']))) || loaded) return;
						el.onload = el.onreadystatechange = null;
						loaded = 1;
						broadcast('ocLazyLoad.fileLoaded', path);
						deferred.resolve();
					};
					el.onerror = function() {
						deferred.reject(new Error('Unable to load ' + path));
					};
					el.async = params.serie ? 0 : 1;
					var insertBeforeElem = anchor.lastChild;
					if(params.insertBefore) {
						var element = angular.element(params.insertBefore);
						if(element && element.length > 0) {
							insertBeforeElem = element[0];
						}
					}
					anchor.insertBefore(el, insertBeforeElem);
					if(type === 'css') {
						if(!uaCssChecked) {
							var ua = navigator.userAgent.toLowerCase();
							if(/iP(hone|od|ad)/.test(navigator.platform)) {
								var v = (navigator.appVersion).match(/OS (\d+)_(\d+)_?(\d+)?/);
								var iOSVersion = parseFloat([parseInt(v[1], 10), parseInt(v[2], 10), parseInt(v[3] || 0, 10)].join('.'));
								useCssLoadPatch = iOSVersion < 6;
							} else if(ua.indexOf("android") > -1) { // Android < 4.4
								var androidVersion = parseFloat(ua.slice(ua.indexOf("android") + 8));
								useCssLoadPatch = androidVersion < 4.4;
							} else if(ua.indexOf('safari') > -1 && ua.indexOf('chrome') === -1) {
								var safariVersion = parseFloat(ua.match(/version\/([\.\d]+)/i)[1]);
								useCssLoadPatch = safariVersion < 6;
							}
						}
						if(useCssLoadPatch) {
							var tries = 1000; // * 20 = 20000 miliseconds
							var interval = $interval(function() {
								try {
									el.sheet.cssRules;
									$interval.cancel(interval);
									el.onload();
								} catch(e) {
									if(--tries <= 0) {
										el.onerror();
									}
								}
							}, 20);
						}
					}
					return deferred.promise;
				};
				if(angular.isUndefined(jsLoader)) {
					jsLoader = function(paths, callback, params) {
						var promises = [];
						forEachArray(paths, function loading(path) {
							promises.push(buildElement('js', path, params));
						});
						$q.all(promises).then(function success() {
							callback();
						}, function error(err) {
							callback(err);
						});
					};
					jsLoader.ocLazyLoadLoader = true;
				}
				if(angular.isUndefined(cssLoader)) {
					cssLoader = function(paths, callback, params) {
						var promises = [];
						forEachArray(paths, function loading(path) {
							promises.push(buildElement('css', path, params));
						});
						$q.all(promises).then(function success() {
							callback();
						}, function error(err) {
							callback(err);
						});
					};
					cssLoader.ocLazyLoadLoader = true;
				}
				if(angular.isUndefined(templatesLoader)) {
					templatesLoader = function(paths, callback, params) {
						var promises = [];
						forEachArray(paths, function(url) {
							var deferred = $q.defer();
							promises.push(deferred.promise);
							$http.get(url, params).success(function(data) {
								if(angular.isString(data) && data.length > 0) {
									angular.forEach(angular.element(data), function(node) {
										if(node.nodeName === 'SCRIPT' && node.type === 'text/ng-template') {
											$templateCache.put(node.id, node.innerHTML);
										}
									});
								}
								if(angular.isUndefined(filesCache.get(url))) {
									filesCache.put(url, true);
								}
								deferred.resolve();
							}).error(function(err) {
								deferred.reject(new Error('Unable to load template file "' + url + '": ' + err));
							});
						});
						return $q.all(promises).then(function success() {
							callback();
						}, function error(err) {
							callback(err);
						});
					};
					templatesLoader.ocLazyLoadLoader = true;
				}
				var filesLoader = function(config, params) {
					var cssFiles = [],
						templatesFiles = [],
						jsFiles = [],
						promises = [],
						cachePromise = null;
					angular.extend(params || {}, config);
					var pushFile = function(path) {
						cachePromise = filesCache.get(path);
						if(angular.isUndefined(cachePromise) || params.cache === false) {
							if(/\.(css|less)[^\.]*$/.test(path) && cssFiles.indexOf(path) === -1) {
								cssFiles.push(path);
							} else if(/\.(htm|html)[^\.]*$/.test(path) && templatesFiles.indexOf(path) === -1) {
								templatesFiles.push(path);
							} else if(jsFiles.indexOf(path) === -1) {
								jsFiles.push(path);
							}
						} else if(cachePromise) {
							promises.push(cachePromise);
						}
					};
					if(params.serie) {
						pushFile(params.files.shift());
					} else {
						forEachArray(params.files, function(path) {
							pushFile(path);
						});
					}
					if(cssFiles.length > 0) {
						var cssDeferred = $q.defer();
						cssLoader(cssFiles, function(err) {
							if(angular.isDefined(err) && cssLoader.hasOwnProperty('ocLazyLoadLoader')) {
								$log.error(err);
								cssDeferred.reject(err);
							} else {
								cssDeferred.resolve();
							}
						}, params);
						promises.push(cssDeferred.promise);
					}
					if(templatesFiles.length > 0) {
						var templatesDeferred = $q.defer();
						templatesLoader(templatesFiles, function(err) {
							if(angular.isDefined(err) && templatesLoader.hasOwnProperty('ocLazyLoadLoader')) {
								$log.error(err);
								templatesDeferred.reject(err);
							} else {
								templatesDeferred.resolve();
							}
						}, params);
						promises.push(templatesDeferred.promise);
					}
					if(jsFiles.length > 0) {
						var jsDeferred = $q.defer();
						jsLoader(jsFiles, function(err) {
							if(angular.isDefined(err) && jsLoader.hasOwnProperty('ocLazyLoadLoader')) {
								$log.error(err);
								jsDeferred.reject(err);
							} else {
								jsDeferred.resolve();
							}
						}, params);
						promises.push(jsDeferred.promise);
					}
					if(params.serie && params.files.length > 0) {
						return $q.all(promises).then(function success() {
							return filesLoader(config, params);
						});
					} else {
						return $q.all(promises);
					}
				};
				return {
					getModuleConfig: function(moduleName) {
						if(!angular.isString(moduleName)) {
							throw new Error('You need to give the name of the module to get');
						}
						if(!modules[moduleName]) {
							return null;
						}
						return modules[moduleName];
					},
					setModuleConfig: function(moduleConfig) {
						if(!angular.isObject(moduleConfig)) {
							throw new Error('You need to give the module config object to set');
						}
						modules[moduleConfig.name] = moduleConfig;
						return moduleConfig;
					},
					getModules: function() {
						return regModules;
					},
					isLoaded: function(modulesNames) {
						var moduleLoaded = function(module) {
							var isLoaded = regModules.indexOf(module) > -1;
							if(!isLoaded) {
								isLoaded = !!moduleExists(module);
							}
							return isLoaded;
						};
						if(angular.isString(modulesNames)) {
							modulesNames = [modulesNames];
						}
						if(angular.isArray(modulesNames)) {
							var i, len;
							for(i = 0, len = modulesNames.length; i < len; i++) {
								if(!moduleLoaded(modulesNames[i])) {
									return false;
								}
							}
							return true;
						} else {
							throw new Error('You need to define the module(s) name(s)');
						}
					},
					load: function(module, params) {
						var self = this,
							config = null,
							moduleCache = [],
							deferredList = [],
							deferred = $q.defer(),
							moduleName,
							errText;
						if(angular.isUndefined(params)) {
							params = {};
						}
						if(angular.isArray(module)) {
							forEachArray(module, function(m) {
								if(m) {
									deferredList.push(self.load(m, params));
								}
							});
							$q.all(deferredList).then(function success() {
								deferred.resolve(module);
							}, function error(err) {
								deferred.reject(err);
							});
							return deferred.promise;
						}
						moduleName = getModuleName(module);
						if(typeof module === 'string') {
							config = self.getModuleConfig(module);
							if(!config) {
								config = {
									files: [module]
								};
								moduleName = null;
							}
						} else if(typeof module === 'object') {
							config = self.setModuleConfig(module);
						}
						if(config === null) {
							errText = 'Module "' + moduleName + '" is not configured, cannot load.';
							$log.error(errText);
							deferred.reject(new Error(errText));
						} else {
							if(angular.isDefined(config.template)) {
								if(angular.isUndefined(config.files)) {
									config.files = [];
								}
								if(angular.isString(config.template)) {
									config.files.push(config.template);
								} else if(angular.isArray(config.template)) {
									config.files.concat(config.template);
								}
							}
						}
						moduleCache.push = function(value) {
							if(this.indexOf(value) === -1) {
								Array.prototype.push.apply(this, arguments);
							}
						};
						if(angular.isDefined(moduleName) && moduleExists(moduleName) && regModules.indexOf(moduleName) !== -1) {
							moduleCache.push(moduleName);
							if(angular.isUndefined(config.files)) {
								deferred.resolve();
								return deferred.promise;
							}
						}
						var localParams = {};
						angular.extend(localParams, params, config);
						var loadDependencies = function loadDependencies(module) {
							var moduleName,
								loadedModule,
								requires,
								diff,
								promisesList = [];
							moduleName = getModuleName(module);
							if(moduleName === null) {
								return $q.when();
							} else {
								try {
									loadedModule = getModule(moduleName);
								} catch(e) {
									var deferred = $q.defer();
									$log.error(e.message);
									deferred.reject(e);
									return deferred.promise;
								}
								requires = getRequires(loadedModule);
							}
							forEachArray(requires, function(requireEntry) {
								if(typeof requireEntry === 'string') {
									var config = self.getModuleConfig(requireEntry);
									if(config === null) {
										moduleCache.push(requireEntry); // We don't know about this module, but something else might, so push it anyway.
										return;
									}
									requireEntry = config;
								}
								if(moduleExists(requireEntry.name)) {
									if(typeof module !== 'string') {
										diff = requireEntry.files.filter(function(n) {
											return self.getModuleConfig(requireEntry.name).files.indexOf(n) < 0;
										});
										if(diff.length !== 0) {
											$log.warn('Module "', moduleName, '" attempted to redefine configuration for dependency. "', requireEntry.name, '"\n Additional Files Loaded:', diff);
										}
										promisesList.push(filesLoader(requireEntry.files, localParams).then(function() {
											return loadDependencies(requireEntry);
										}));
									}
									return;
								} else if(typeof requireEntry === 'object') {
									if(requireEntry.hasOwnProperty('name') && requireEntry.name) {
										self.setModuleConfig(requireEntry);
										moduleCache.push(requireEntry.name);
									}
									if(requireEntry.hasOwnProperty('css') && requireEntry.css.length !== 0) {
										angular.forEach(requireEntry.css, function(path) {
											buildElement('css', path, localParams);
										});
									}
								}
								if(requireEntry.hasOwnProperty('files') && requireEntry.files.length !== 0) {
									if(requireEntry.files) {
										promisesList.push(filesLoader(requireEntry, localParams).then(function() {
											return loadDependencies(requireEntry);
										}));
									}
								}
							});
							return $q.all(promisesList);
						};
						filesLoader(config, localParams).then(function success() {
							if(moduleName === null) {
								deferred.resolve(module);
							} else {
								moduleCache.push(moduleName);
								loadDependencies(moduleName).then(function success() {
									try {
										justLoaded = [];
										register(providers, moduleCache, localParams);
									} catch(e) {
										$log.error(e.message);
										deferred.reject(e);
										return;
									}
									deferred.resolve(module);
								}, function error(err) {
									deferred.reject(err);
								});
							}
						}, function error(err) {
							deferred.reject(err);
						});
						return deferred.promise;
					}
				};
			}];
			this.config = function(config) {
				if(angular.isDefined(config.jsLoader) || angular.isDefined(config.asyncLoader)) {
					if(!angular.isFunction(config.jsLoader || config.asyncLoader)) {
						throw('The js loader needs to be a function');
					}
					jsLoader = config.jsLoader || config.asyncLoader;
				}
				if(angular.isDefined(config.cssLoader)) {
					if(!angular.isFunction(config.cssLoader)) {
						throw('The css loader needs to be a function');
					}
					cssLoader = config.cssLoader;
				}
				if(angular.isDefined(config.templatesLoader)) {
					if(!angular.isFunction(config.templatesLoader)) {
						throw('The template loader needs to be a function');
					}
					templatesLoader = config.templatesLoader;
				}
				if(angular.isDefined(config.modules)) {
					if(angular.isArray(config.modules)) {
						forEachArray(config.modules, function(moduleConfig) {
							modules[moduleConfig.name] = moduleConfig;
						});
					} else {
						modules[config.modules.name] = config.modules;
					}
				}
				if(angular.isDefined(config.debug)) {
					debug = config.debug;
				}
				if(angular.isDefined(config.events)) {
					events = config.events;
				}
			};
		}]);
	ocLazyLoad.directive('ocLazyLoad', ['$ocLazyLoad', '$compile', '$animate', '$parse',
		function($ocLazyLoad, $compile, $animate, $parse) {
			return {
				restrict: 'A',
				terminal: true,
				priority: 1000,
				compile: function(element) {
					var content = element[0].innerHTML;
					element.html('');
					return function($scope, $element, $attr) {
						var model = $parse($attr.ocLazyLoad);
						$scope.$watch(function() {
							return model($scope) || $attr.ocLazyLoad;
						}, function(moduleName) {
							if(angular.isDefined(moduleName)) {
								$ocLazyLoad.load(moduleName).then(function success() {
									$animate.enter($compile(content)($scope), null, $element);
								});
							}
						}, true);
					};
				}
			};
		}]);
	function getRequires(module) {
		var requires = [];
		forEachArray(module.requires, function(requireModule) {
			if(regModules.indexOf(requireModule) === -1) {
				requires.push(requireModule);
			}
		});
		return requires;
	}
	function moduleExists(moduleName) {
		try {
			return angular.module(moduleName);
		} catch(e) {
			if(/No module/.test(e) || (e.message.indexOf('$injector:nomod') > -1)) {
				return false;
			}
		}
	}
	function getModule(moduleName) {
		try {
			return angular.module(moduleName);
		} catch(e) {
			if(/No module/.test(e) || (e.message.indexOf('$injector:nomod') > -1)) {
				e.message = 'The module "' + moduleName + '" that you are trying to load does not exist. ' + e.message;
			}
			throw e;
		}
	}
	function invokeQueue(providers, queue, moduleName, reconfig) {
		if(!queue) {
			return;
		}
		var i, len, args, provider;
		for(i = 0, len = queue.length; i < len; i++) {
			args = queue[i];
			if(angular.isArray(args)) {
				if(providers !== null) {
					if(providers.hasOwnProperty(args[0])) {
						provider = providers[args[0]];
					} else {
						throw new Error('unsupported provider ' + args[0]);
					}
				}
				var isNew = registerInvokeList(args, moduleName);
				if(args[1] !== 'invoke') {
					if(isNew && angular.isDefined(provider)) {
						provider[args[1]].apply(provider, args[2]);
					}
				} else { // config block
					var callInvoke = function(fct) {
						var invoked = regConfigs.indexOf(moduleName + '-' + fct);
						if(invoked === -1 || reconfig) {
							if(invoked === -1) {
								regConfigs.push(moduleName + '-' + fct);
							}
							if(angular.isDefined(provider)) {
								provider[args[1]].apply(provider, args[2]);
							}
						}
					};
					if(angular.isFunction(args[2][0])) {
						callInvoke(args[2][0]);
					} else if(angular.isArray(args[2][0])) {
						for(var j = 0, jlen = args[2][0].length; j < jlen; j++) {
							if(angular.isFunction(args[2][0][j])) {
								callInvoke(args[2][0][j]);
							}
						}
					}
				}
			}
		}
	}
	function register(providers, registerModules, params) {
		if(registerModules) {
			var k, moduleName, moduleFn, tempRunBlocks = [];
			for(k = registerModules.length - 1; k >= 0; k--) {
				moduleName = registerModules[k];
				if(typeof moduleName !== 'string') {
					moduleName = getModuleName(moduleName);
				}
				if(!moduleName || justLoaded.indexOf(moduleName) !== -1) {
					continue;
				}
				var newModule = regModules.indexOf(moduleName) === -1;
				moduleFn = angular.module(moduleName);
				if(newModule) { // new module
					regModules.push(moduleName);
					register(providers, moduleFn.requires, params);
				}
				if(moduleFn._runBlocks.length > 0) {
					runBlocks[moduleName] = [];
					while(moduleFn._runBlocks.length > 0) {
						runBlocks[moduleName].push(moduleFn._runBlocks.shift());
					}
				}
				if(angular.isDefined(runBlocks[moduleName]) && (newModule || params.rerun)) {
					tempRunBlocks = tempRunBlocks.concat(runBlocks[moduleName]);
				}
				invokeQueue(providers, moduleFn._invokeQueue, moduleName, params.reconfig);
				invokeQueue(providers, moduleFn._configBlocks, moduleName, params.reconfig); // angular 1.3+
				broadcast(newModule ? 'ocLazyLoad.moduleLoaded' : 'ocLazyLoad.moduleReloaded', moduleName);
				registerModules.pop();
				justLoaded.push(moduleName);
			}
			var instanceInjector = providers.getInstanceInjector();
			forEachArray(tempRunBlocks, function(fn) {
				instanceInjector.invoke(fn);
			});
		}
	}
	function registerInvokeList(args, moduleName) {
		var invokeList = args[2][0],
			type = args[1],
			newInvoke = false;
		if(angular.isUndefined(regInvokes[moduleName])) {
			regInvokes[moduleName] = {};
		}
		if(angular.isUndefined(regInvokes[moduleName][type])) {
			regInvokes[moduleName][type] = [];
		}
		var onInvoke = function(invokeName) {
			newInvoke = true;
			regInvokes[moduleName][type].push(invokeName);
			broadcast('ocLazyLoad.componentLoaded', [moduleName, type, invokeName]);
		};
		if(angular.isString(invokeList) && regInvokes[moduleName][type].indexOf(invokeList) === -1) {
			onInvoke(invokeList);
		} else if(angular.isObject(invokeList)) {
			forEachArray(invokeList, function(invoke) {
				if(angular.isString(invoke) && regInvokes[moduleName][type].indexOf(invoke) === -1) {
					onInvoke(invoke);
				}
			});
		} else {
			return false;
		}
		return newInvoke;
	}
	function getModuleName(module) {
		var moduleName = null;
		if(angular.isString(module)) {
			moduleName = module;
		} else if(angular.isObject(module) && module.hasOwnProperty('name') && angular.isString(module.name)) {
			moduleName = module.name;
		}
		return moduleName;
	}
	var bootstrap = angular.bootstrap;
	angular.bootstrap = function(element, modules, config) {
		initModules = modules.slice(); // make a clean copy
		return bootstrap(element, modules, config);
	};
})();
