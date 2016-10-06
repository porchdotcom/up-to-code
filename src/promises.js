import Q from 'q';

// promise version of filter...resolve to boolean
export const filter = (arr, fn) => {
    const ret = [];
    return Q.all(arr.map(elem => {
        return Q.fcall(() => {
            return fn(elem);
        }).then(include => {
            if (include) {
                ret.push(elem);
            }
        });
    })).thenResolve(ret);
};

export const until = (fn, delay) => (
    Q.fcall(() => (
        fn()
    )).then(condition => (
        condition || Q.delay(delay).then(() => until(fn, delay))
    ))
);
