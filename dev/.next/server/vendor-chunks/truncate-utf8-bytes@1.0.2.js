"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/truncate-utf8-bytes@1.0.2";
exports.ids = ["vendor-chunks/truncate-utf8-bytes@1.0.2"];
exports.modules = {

/***/ "(rsc)/./node_modules/.pnpm/truncate-utf8-bytes@1.0.2/node_modules/truncate-utf8-bytes/index.js":
/*!************************************************************************************************!*\
  !*** ./node_modules/.pnpm/truncate-utf8-bytes@1.0.2/node_modules/truncate-utf8-bytes/index.js ***!
  \************************************************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\n\nvar truncate = __webpack_require__(/*! ./lib/truncate */ \"(rsc)/./node_modules/.pnpm/truncate-utf8-bytes@1.0.2/node_modules/truncate-utf8-bytes/lib/truncate.js\");\nvar getLength = Buffer.byteLength.bind(Buffer);\nmodule.exports = truncate.bind(null, getLength);\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvLnBucG0vdHJ1bmNhdGUtdXRmOC1ieXRlc0AxLjAuMi9ub2RlX21vZHVsZXMvdHJ1bmNhdGUtdXRmOC1ieXRlcy9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBYTs7QUFFYixlQUFlLG1CQUFPLENBQUMsNkhBQWdCO0FBQ3ZDO0FBQ0EiLCJzb3VyY2VzIjpbIi9Vc2Vycy9uaWNrL0Rlc2t0b3AvQnVzaW5lc3MvUGF5bG9hZENNUy9wYXlsb2FkLXN0b3JhZ2UtY2xvdWRpbmFyeS9kZXYvbm9kZV9tb2R1bGVzLy5wbnBtL3RydW5jYXRlLXV0ZjgtYnl0ZXNAMS4wLjIvbm9kZV9tb2R1bGVzL3RydW5jYXRlLXV0ZjgtYnl0ZXMvaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdHJ1bmNhdGUgPSByZXF1aXJlKFwiLi9saWIvdHJ1bmNhdGVcIik7XG52YXIgZ2V0TGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGguYmluZChCdWZmZXIpO1xubW9kdWxlLmV4cG9ydHMgPSB0cnVuY2F0ZS5iaW5kKG51bGwsIGdldExlbmd0aCk7XG4iXSwibmFtZXMiOltdLCJpZ25vcmVMaXN0IjpbMF0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/.pnpm/truncate-utf8-bytes@1.0.2/node_modules/truncate-utf8-bytes/index.js\n");

/***/ }),

/***/ "(rsc)/./node_modules/.pnpm/truncate-utf8-bytes@1.0.2/node_modules/truncate-utf8-bytes/lib/truncate.js":
/*!*******************************************************************************************************!*\
  !*** ./node_modules/.pnpm/truncate-utf8-bytes@1.0.2/node_modules/truncate-utf8-bytes/lib/truncate.js ***!
  \*******************************************************************************************************/
/***/ ((module) => {

eval("\n\nfunction isHighSurrogate(codePoint) {\n  return codePoint >= 0xd800 && codePoint <= 0xdbff;\n}\n\nfunction isLowSurrogate(codePoint) {\n  return codePoint >= 0xdc00 && codePoint <= 0xdfff;\n}\n\n// Truncate string by size in bytes\nmodule.exports = function truncate(getLength, string, byteLength) {\n  if (typeof string !== \"string\") {\n    throw new Error(\"Input must be string\");\n  }\n\n  var charLength = string.length;\n  var curByteLength = 0;\n  var codePoint;\n  var segment;\n\n  for (var i = 0; i < charLength; i += 1) {\n    codePoint = string.charCodeAt(i);\n    segment = string[i];\n\n    if (isHighSurrogate(codePoint) && isLowSurrogate(string.charCodeAt(i + 1))) {\n      i += 1;\n      segment += string[i];\n    }\n\n    curByteLength += getLength(segment);\n\n    if (curByteLength === byteLength) {\n      return string.slice(0, i + 1);\n    }\n    else if (curByteLength > byteLength) {\n      return string.slice(0, i - segment.length + 1);\n    }\n  }\n\n  return string;\n};\n\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvLnBucG0vdHJ1bmNhdGUtdXRmOC1ieXRlc0AxLjAuMi9ub2RlX21vZHVsZXMvdHJ1bmNhdGUtdXRmOC1ieXRlcy9saWIvdHJ1bmNhdGUuanMiLCJtYXBwaW5ncyI6IkFBQWE7O0FBRWI7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLGtCQUFrQixnQkFBZ0I7QUFDbEM7QUFDQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTs7QUFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUFFQTtBQUNBIiwic291cmNlcyI6WyIvVXNlcnMvbmljay9EZXNrdG9wL0J1c2luZXNzL1BheWxvYWRDTVMvcGF5bG9hZC1zdG9yYWdlLWNsb3VkaW5hcnkvZGV2L25vZGVfbW9kdWxlcy8ucG5wbS90cnVuY2F0ZS11dGY4LWJ5dGVzQDEuMC4yL25vZGVfbW9kdWxlcy90cnVuY2F0ZS11dGY4LWJ5dGVzL2xpYi90cnVuY2F0ZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIGlzSGlnaFN1cnJvZ2F0ZShjb2RlUG9pbnQpIHtcbiAgcmV0dXJuIGNvZGVQb2ludCA+PSAweGQ4MDAgJiYgY29kZVBvaW50IDw9IDB4ZGJmZjtcbn1cblxuZnVuY3Rpb24gaXNMb3dTdXJyb2dhdGUoY29kZVBvaW50KSB7XG4gIHJldHVybiBjb2RlUG9pbnQgPj0gMHhkYzAwICYmIGNvZGVQb2ludCA8PSAweGRmZmY7XG59XG5cbi8vIFRydW5jYXRlIHN0cmluZyBieSBzaXplIGluIGJ5dGVzXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIHRydW5jYXRlKGdldExlbmd0aCwgc3RyaW5nLCBieXRlTGVuZ3RoKSB7XG4gIGlmICh0eXBlb2Ygc3RyaW5nICE9PSBcInN0cmluZ1wiKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW5wdXQgbXVzdCBiZSBzdHJpbmdcIik7XG4gIH1cblxuICB2YXIgY2hhckxlbmd0aCA9IHN0cmluZy5sZW5ndGg7XG4gIHZhciBjdXJCeXRlTGVuZ3RoID0gMDtcbiAgdmFyIGNvZGVQb2ludDtcbiAgdmFyIHNlZ21lbnQ7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGFyTGVuZ3RoOyBpICs9IDEpIHtcbiAgICBjb2RlUG9pbnQgPSBzdHJpbmcuY2hhckNvZGVBdChpKTtcbiAgICBzZWdtZW50ID0gc3RyaW5nW2ldO1xuXG4gICAgaWYgKGlzSGlnaFN1cnJvZ2F0ZShjb2RlUG9pbnQpICYmIGlzTG93U3Vycm9nYXRlKHN0cmluZy5jaGFyQ29kZUF0KGkgKyAxKSkpIHtcbiAgICAgIGkgKz0gMTtcbiAgICAgIHNlZ21lbnQgKz0gc3RyaW5nW2ldO1xuICAgIH1cblxuICAgIGN1ckJ5dGVMZW5ndGggKz0gZ2V0TGVuZ3RoKHNlZ21lbnQpO1xuXG4gICAgaWYgKGN1ckJ5dGVMZW5ndGggPT09IGJ5dGVMZW5ndGgpIHtcbiAgICAgIHJldHVybiBzdHJpbmcuc2xpY2UoMCwgaSArIDEpO1xuICAgIH1cbiAgICBlbHNlIGlmIChjdXJCeXRlTGVuZ3RoID4gYnl0ZUxlbmd0aCkge1xuICAgICAgcmV0dXJuIHN0cmluZy5zbGljZSgwLCBpIC0gc2VnbWVudC5sZW5ndGggKyAxKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gc3RyaW5nO1xufTtcblxuIl0sIm5hbWVzIjpbXSwiaWdub3JlTGlzdCI6WzBdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/.pnpm/truncate-utf8-bytes@1.0.2/node_modules/truncate-utf8-bytes/lib/truncate.js\n");

/***/ })

};
;