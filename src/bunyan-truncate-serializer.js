import { isString, isPlainObject, truncate } from 'lodash';

export default body => {
    if (isString(body)) {
        return truncate(body);
    } else if (isPlainObject(body)) {
        return JSON.parse(JSON.stringify(body, (k, v) => isString(v) ? truncate(v) : v));
    }
    return body;
};
