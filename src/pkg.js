import jsonFile from 'json-file-plus';
import Q from 'q';
import exec from './exec';
import semverRegex from 'semver-regex';

// update to exact versions
// return whether the new version is not a major bump (ie, safe to merge without review)
const exactVersion = version => version.match(semverRegex())[0];

export default path => ({
    version: packageName => (
        Q.fcall(() => (
            jsonFile(path)
        )).then(file => (
            Q.all([
                file.get(),
                exec(`npm view ${packageName} version`).then(version => version.trim())
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
    ),
    update: packageName => (
        Q.fcall(() => (
            jsonFile(path)
        )).then(file => (
            Q.all([
                file.get(),
                exec(`npm view ${packageName} version`).then(version => version.trim())
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
    )
});
