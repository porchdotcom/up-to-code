import jsonFile from 'json-file-plus';
import Q from 'q';
import exec from './exec';
import semverRegex from 'semver-regex';
import { memoize } from 'lodash';

// update to exact versions
// return whether the new version is not a major bump (ie, safe to merge without review)
const exactVersion = version => version.match(semverRegex())[0];
const getPublishedVersion = memoize(packageName => (
    exec(`npm view ${packageName} version`).then(version => version.trim())
));

const getVersion = (path, packageName) => (
    Q.fcall(() => (
        jsonFile(path)
    )).then(file => (
        Q.all([
            file.get(),
            getPublishedVersion(packageName)
        ]).spread(({
            dependencies = {},
            devDependencies = {},
            peerDependencies = {}
        }) => {
            if (dependencies.hasOwnProperty(packageName)) {
                return exactVersion(dependencies[packageName]);
            }
            if (devDependencies.hasOwnProperty(packageName)) {
                return exactVersion(devDependencies[packageName]);
            }
            if (peerDependencies.hasOwnProperty(packageName)) {
                return exactVersion(peerDependencies[packageName]);
            }
            throw new Error(`${packageName} not found`);
        })
    ))
);

const updateVersion = (path, packageName) => (
    Q.fcall(() => (
        jsonFile(path)
    )).then(file => (
        Q.all([
            file.get(),
            getPublishedVersion(packageName)
        ]).spread(({
            dependencies = {},
            devDependencies = {},
            peerDependencies = {}
        }, version) => {
            if (dependencies.hasOwnProperty(packageName)) {
                return file.set({
                    dependencies: {
                        [packageName]: version
                    }
                });
            }
            if (devDependencies.hasOwnProperty(packageName)) {
                return file.set({
                    devDependencies: {
                        [packageName]: version
                    }
                });
            }
            if (peerDependencies.hasOwnProperty(packageName)) {
                return file.set({
                    peerDependencies: {
                        [packageName]: version
                    }
                });
            }
            throw new Error(`${packageName} not found`);
        }).then(() => (
            file.save()
        ))
    ))
);

export default (path, packageName) => (
    Q.fcall(() => (
        getVersion(path, packageName)
    )).then(before => (
        Q.fcall(() => (
            updateVersion(path, packageName)
        )).then(() => (
            getVersion(path, packageName)
        )).then(after => (
            [before, after]
        ))
    ))
);
