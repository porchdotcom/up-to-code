import cleanStack from 'clean-stack';

export default ({
    code,
    message,
    name,
    signal,
    stack
}) => ({
    code,
    message,
    name,
    signal,
    stack: cleanStack(stack).replace(new RegExp(process.cwd(), 'g'), '.')
});
