Custom build based on fork of angular.js and ocLazyLoad

Some changes -
- separate forEach into forEachArray and forEachObject
- removed manualLowercase
- delete Object.prototype.watch / unwatch (no, thanks firefox)
- remove csp, noUnsafeEval = false;
- disable automatic loading of ng-app, you must use angular.bootstrap
- angular.element is always jqlite
- added cssCamelCase, removed MOZ_HACK_REGEXP from camelCase
- debugInfoEnable = false by default
- removed `PREFIX_REGEXP`, no `data-ng-`, `x-`, but only `ng-`
- removed class/comments directives, must use only attribute or element directive
- made all events async
  - removed $parsing with expensiveChecks during directive binding
  - trigger `$evalAsync` on event fired
- removed inline style, use `.ng-hide { display: none; }` yourself in css
- set $clicked on $rootScope when click event triggered on links, and unset after $rootScope.$apply
- removed $$testability directive
- useApplyAsync = true by default in $http
