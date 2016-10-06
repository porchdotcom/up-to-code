import { until } from '../src/promises';
import assert from 'assert';

describe.only('until', () => {
    it('keeps going until the condition is true', () => {
        let condition = false;
        let count = 0;
        setTimeout(() => {
            condition = true;
        }, 1000);

        return until(() => {
            count++;
            return condition;
        }, 100).then(() => {
            assert(count > 5, count);
            assert(count < 15, count);
        });
    });
});
