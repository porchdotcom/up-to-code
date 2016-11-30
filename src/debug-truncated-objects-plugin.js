import debug from 'debug';
import { isString, isObject, truncate } from 'lodash';

const truncateObjectStrings = o => (
    isObject(o) ?
        JSON.parse(JSON.stringify(o, (k, v) => (
            isString(v) ? truncate(v, { length: 60 }) : v
        ))) :
        o
);
const o = debug.formatters.o;
const O = debug.formatters.O;

debug.formatters.o = v => o(truncateObjectStrings(v));
debug.formatters.O = v => O(truncateObjectStrings(v));

