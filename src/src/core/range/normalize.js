var voidElements = require('void-elements');

voidElements = Object.keys(voidElements).map(function (obj, name) {
    var obj = {}; obj[name] = true;
    return obj;
}, {});

// normalizeRange based on work by @@tootallnate
function normalizeRange (range) {
    var sc = range.startContainer;
    var so = range.startOffset;
    var ec = range.endContainer;
    var eo = range.endOffset;
    var collapsed = range.collapsed;
    var end;

    if (!collapsed && sc.nodeType === 3 && so === sc.nodeValue.length) {
        // start is at end of TextNode, need to move to `nextSibling`');
        while (sc && !sc.nextSibling) sc = sc.parentNode;

        if (sc) {
            sc = sc.nextSibling;
            so = 0;
        } else {
            // could not find TextNode within %o, resetting `sc`', range.startContainer);
            sc = range.startContainer;
        }
    }

    if (sc.nodeType === 1) {
        if (voidElements[sc.nodeName]) {
            // start is a "void element", need to use parent node', sc);
            var v = sc;
            sc = v.parentNode;
            so = indexOf(sc.childNodes, v);
        } else {
            // start is an Element, need to find deepest child node at offset %o', so);

            if (so >= sc.childNodes.length) {
                end = true;
                sc = sc.childNodes[sc.childNodes.length - 1];
            } else {
                end = false;
                sc = sc.childNodes[so];
            }

            var c;
            while (sc) {
                if (sc.nodeType === 3) break;
                if (end) {
                    c = sc.lastChild;
                } else {
                    c = sc.firstChild;
                }
                if (c && voidElements[c.nodeName]) break;
                sc = c;
            }

            if (sc) {
                if (sc.nodeType === 1) {
                    // a "void element"'s parent
                    so = end ? sc.childNodes.length : 0;
                } else {
                    // text node
                    so = end ? sc.nodeValue.length : 0;
                }
            } else {
                //could not find TextNode within %o, resetting `sc`', range.startContainer);
                sc = range.startContainer;
                so = range.startOffset;
            }
        }
    }

    if (collapsed) {
        // if we're dealing with a collapsed Range, then update the end
        // points to match our normalized start container and offset
        ec = sc;
        eo = so;
    } else {
        while (true) {
            if (eo === 0) {
                //end is at start of Node, need to move to `previousSibling`');

                while (ec && !ec.previousSibling) {
                    ec = ec.parentNode;
                }

                if (ec) {
                    ec = ec.previousSibling;
                    eo = ec.nodeType === 3 ? ec.nodeValue.length : ec.childNodes.length;
                } else {
                    // could not find Node within %o, resetting `ec`', range.endContainer);
                    if (collapsed) {
                        ec = sc;
                        eo = so;
                    } else {
                        ec = range.endContainer;
                        eo = range.endOffset;
                    }
                    break;
                }
            }

            // fix overlapping line-return selections
            if (ec.nodeType === 3 && /^\n+$/.test( ec.textContent )){
                while (ec && !ec.previousSibling) {
                    ec = ec.parentNode;
                }
                if (ec) {
                    ec = ec.previousSibling;
                    eo = ec.nodeType === 3 ? ec.nodeValue.length : ec.childNodes.length;
                }
            }

            if (ec.nodeType === 1) {
                if (voidElements[ec.nodeName]) {
                    //end is a "void element", need to use parent node', ec);
                    var v = ec;
                    ec = v.parentNode;
                    eo = indexOf(ec.childNodes, v) + 1;
                    break;
                } else {
                    //end is an Element, need to find deepest node at offset %o', eo);
                    end = true;

                    if (eo >= ec.childNodes.length) {
                        ec = ec.childNodes[ec.childNodes.length - 1];
                    } else {
                        ec = ec.childNodes[eo - 1];
                    }

                    var c;
                    while (ec) {
                        if (ec.nodeType === 3) break;
                        c = ec.lastChild;
                        if (c && voidElements[c.nodeName]) break;
                        ec = c;
                    }

                    if (ec) {
                        if (ec.nodeType === 1) {
                            // a "void element"'s parent
                            eo = ec.childNodes.length;
                        } else {
                            // text node
                            eo = ec.nodeValue.length;
                        }
                        break;
                    } else {
                        //could not find TextNode within %o, resetting `ec`', range.endContainer);
                        if (collapsed) {
                            ec = sc;
                            eo = so;
                        } else {
                            ec = range.endContainer;
                            eo = range.endOffset;
                        }
                        break;
                    }
                }
            } else {
                break;
            }
        }
    }

    if (sc !== range.startContainer || so !== range.startOffset) {
        //normalizing Range `start` to %o %o:', sc, so);
        range.setStart(sc, so);
    }
    if (ec !== range.endContainer || eo !== range.endOffset) {
        //normalizing Range `end` to %o %o:', ec, eo);
        range.setEnd(ec, eo);
    }

    return range;
}

module.exports = normalizeRange;
