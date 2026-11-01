/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

module.exports = freeGlobal;



//////////////////
// WEBPACK FOOTER
// ./~/lodash/_freeGlobal.js
// module id = 9
// module chunks = 0