"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/scmp@2.1.0";
exports.ids = ["vendor-chunks/scmp@2.1.0"];
exports.modules = {

/***/ "(rsc)/./node_modules/.pnpm/scmp@2.1.0/node_modules/scmp/index.js":
/*!******************************************************************!*\
  !*** ./node_modules/.pnpm/scmp@2.1.0/node_modules/scmp/index.js ***!
  \******************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\n\nconst crypto = __webpack_require__(/*! crypto */ \"crypto\")\nconst scmpCompare = __webpack_require__(/*! ./lib/scmpCompare */ \"(rsc)/./node_modules/.pnpm/scmp@2.1.0/node_modules/scmp/lib/scmpCompare.js\")\n\n/**\n * Does a constant-time Buffer comparison by not short-circuiting\n * on first sign of non-equivalency.\n *\n * @param {Buffer} a The first Buffer to be compared against the second\n * @param {Buffer} b The second Buffer to be compared against the first\n * @return {Boolean}\n */\nmodule.exports = function scmp (a, b) {\n  // check that both inputs are buffers\n  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {\n    throw new Error('Both scmp args must be Buffers')\n  }\n\n  // return early here if buffer lengths are not equal since timingSafeEqual\n  // will throw if buffer lengths are not equal\n  if (a.length !== b.length) {\n    return false\n  }\n\n  // use crypto.timingSafeEqual if available (since Node.js v6.6.0),\n  // otherwise use our own scmp-internal function.\n  if (crypto.timingSafeEqual) {\n    return crypto.timingSafeEqual(a, b)\n  }\n\n  return scmpCompare(a, b)\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvLnBucG0vc2NtcEAyLjEuMC9ub2RlX21vZHVsZXMvc2NtcC9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBWTs7QUFFWixlQUFlLG1CQUFPLENBQUMsc0JBQVE7QUFDL0Isb0JBQW9CLG1CQUFPLENBQUMscUdBQW1COztBQUUvQztBQUNBO0FBQ0E7QUFDQTtBQUNBLFdBQVcsUUFBUTtBQUNuQixXQUFXLFFBQVE7QUFDbkIsWUFBWTtBQUNaO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUE7QUFDQSIsInNvdXJjZXMiOlsiL1VzZXJzL25pY2svRGVza3RvcC9CdXNpbmVzcy9QYXlsb2FkQ01TL3BheWxvYWQtc3RvcmFnZS1jbG91ZGluYXJ5L2Rldi9ub2RlX21vZHVsZXMvLnBucG0vc2NtcEAyLjEuMC9ub2RlX21vZHVsZXMvc2NtcC9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCdcblxuY29uc3QgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJylcbmNvbnN0IHNjbXBDb21wYXJlID0gcmVxdWlyZSgnLi9saWIvc2NtcENvbXBhcmUnKVxuXG4vKipcbiAqIERvZXMgYSBjb25zdGFudC10aW1lIEJ1ZmZlciBjb21wYXJpc29uIGJ5IG5vdCBzaG9ydC1jaXJjdWl0aW5nXG4gKiBvbiBmaXJzdCBzaWduIG9mIG5vbi1lcXVpdmFsZW5jeS5cbiAqXG4gKiBAcGFyYW0ge0J1ZmZlcn0gYSBUaGUgZmlyc3QgQnVmZmVyIHRvIGJlIGNvbXBhcmVkIGFnYWluc3QgdGhlIHNlY29uZFxuICogQHBhcmFtIHtCdWZmZXJ9IGIgVGhlIHNlY29uZCBCdWZmZXIgdG8gYmUgY29tcGFyZWQgYWdhaW5zdCB0aGUgZmlyc3RcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKi9cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2NtcCAoYSwgYikge1xuICAvLyBjaGVjayB0aGF0IGJvdGggaW5wdXRzIGFyZSBidWZmZXJzXG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGEpIHx8ICFCdWZmZXIuaXNCdWZmZXIoYikpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JvdGggc2NtcCBhcmdzIG11c3QgYmUgQnVmZmVycycpXG4gIH1cblxuICAvLyByZXR1cm4gZWFybHkgaGVyZSBpZiBidWZmZXIgbGVuZ3RocyBhcmUgbm90IGVxdWFsIHNpbmNlIHRpbWluZ1NhZmVFcXVhbFxuICAvLyB3aWxsIHRocm93IGlmIGJ1ZmZlciBsZW5ndGhzIGFyZSBub3QgZXF1YWxcbiAgaWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG5cbiAgLy8gdXNlIGNyeXB0by50aW1pbmdTYWZlRXF1YWwgaWYgYXZhaWxhYmxlIChzaW5jZSBOb2RlLmpzIHY2LjYuMCksXG4gIC8vIG90aGVyd2lzZSB1c2Ugb3VyIG93biBzY21wLWludGVybmFsIGZ1bmN0aW9uLlxuICBpZiAoY3J5cHRvLnRpbWluZ1NhZmVFcXVhbCkge1xuICAgIHJldHVybiBjcnlwdG8udGltaW5nU2FmZUVxdWFsKGEsIGIpXG4gIH1cblxuICByZXR1cm4gc2NtcENvbXBhcmUoYSwgYilcbn1cbiJdLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOlswXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/.pnpm/scmp@2.1.0/node_modules/scmp/index.js\n");

/***/ }),

/***/ "(rsc)/./node_modules/.pnpm/scmp@2.1.0/node_modules/scmp/lib/scmpCompare.js":
/*!****************************************************************************!*\
  !*** ./node_modules/.pnpm/scmp@2.1.0/node_modules/scmp/lib/scmpCompare.js ***!
  \****************************************************************************/
/***/ ((module) => {

eval("\n\nmodule.exports = function scmpCompare (a, b) {\n  const len = a.length\n  let result = 0\n  for (let i = 0; i < len; ++i) {\n    result |= a[i] ^ b[i]\n  }\n  return result === 0\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvLnBucG0vc2NtcEAyLjEuMC9ub2RlX21vZHVsZXMvc2NtcC9saWIvc2NtcENvbXBhcmUuanMiLCJtYXBwaW5ncyI6IkFBQVk7O0FBRVo7QUFDQTtBQUNBO0FBQ0Esa0JBQWtCLFNBQVM7QUFDM0I7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzIjpbIi9Vc2Vycy9uaWNrL0Rlc2t0b3AvQnVzaW5lc3MvUGF5bG9hZENNUy9wYXlsb2FkLXN0b3JhZ2UtY2xvdWRpbmFyeS9kZXYvbm9kZV9tb2R1bGVzLy5wbnBtL3NjbXBAMi4xLjAvbm9kZV9tb2R1bGVzL3NjbXAvbGliL3NjbXBDb21wYXJlLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIid1c2Ugc3RyaWN0J1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHNjbXBDb21wYXJlIChhLCBiKSB7XG4gIGNvbnN0IGxlbiA9IGEubGVuZ3RoXG4gIGxldCByZXN1bHQgPSAwXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICByZXN1bHQgfD0gYVtpXSBeIGJbaV1cbiAgfVxuICByZXR1cm4gcmVzdWx0ID09PSAwXG59XG4iXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbMF0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/.pnpm/scmp@2.1.0/node_modules/scmp/lib/scmpCompare.js\n");

/***/ })

};
;