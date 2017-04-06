import assert from 'assert';
import jsonFile from 'json-file-plus';
import Q from 'q';
import exec from './exec';
import semverRegex from 'semver-regex';
import { memoize } from 'lodash';
import { satisfies } from 'semver';

// update to exact versions
// return whether the new version is not a major bump (ie, safe to merge without review)
const exactVersion = version => {
    const match = version.match(semverRegex());
    assert(match, `${version} must be valid semver`);
    return match[0];
};
const getPublishedVersion = memoize((packageName, logger) => (
    exec(`npm view ${packageName} version`, { logger }).then(version => version.trim())
));

const getVersion = ({ path, packageName }) => (
    Q.fcall(() => (
        jsonFile(path)
    )).then(file => (
        file.get()
    )).then(({
        dependencies = {},
        devDependencies = {},
        peerDependencies = {}
    }) => {
        if (dependencies.hasOwnProperty(packageName)) {
            assert(!devDependencies.hasOwnProperty(packageName), `${packageName} found in both dependencies and devDependencies`);
            assert(!peerDependencies.hasOwnProperty(packageName), `${packageName} found in both dependencies and peerDependencies`);
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
);

const updateVersion = ({ path, packageName, logger }) => (
    Q.fcall(() => (
        jsonFile(path)
    )).then(file => (
        Q.all([
            file.get(),
            getPublishedVersion(packageName, logger)
        ]).spread(({
            dependencies = {},
            devDependencies = {},
            peerDependencies = {}
        }, version) => {
            if (dependencies.hasOwnProperty(packageName)) {
                assert(!satisfies(version, dependencies[packageName]), `${packageName} latest version ${version} matches existing dependency ${dependencies[packageName]}`);
                return file.set({
                    dependencies: {
                        [packageName]: `^${version}`
                    }
                });
            }
            if (devDependencies.hasOwnProperty(packageName)) {
                assert(!satisfies(version, devDependencies[packageName]), `${packageName} latest version ${version} matches existing devDependency version ${devDependencies[packageName]}`);
                return file.set({
                    devDependencies: {
                        [packageName]: `^${version}`
                    }
                });
            }
            if (peerDependencies.hasOwnProperty(packageName)) {
                assert(!satisfies(version, peerDependencies[packageName]), `${packageName} latest version ${version} matches existing peerDependency version ${peerDependencies[packageName]}`);
                return file.set({
                    peerDependencies: {
                        [packageName]: `^${version}`
                    }
                });
            }
            throw new Error(`${packageName} not found`);
        }).then(() => (
            file.save()
        ))
    ))
);

export default ({ path, packageName, logger }) => (
    Q.fcall(() => (
        getVersion({ path, packageName, logger })
    )).then(before => (
        Q.fcall(() => (
            updateVersion({ path, packageName, logger })
        )).then(() => (
            getVersion({ path, packageName, logger })
        )).then(after => (
            [before, after]
        ))
    ))
);
