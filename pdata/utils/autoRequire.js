const { execSync } = require('child_process');
const listPackage = require('../../package.json').dependencies;
const listbuiltinModules = require("module").builtinModules;

// Tự động require, nếu thiếu thì tự động cài
function autoRequire(pkg, version, localPath) {
    try {
        if (listPackage.hasOwnProperty(pkg) || listbuiltinModules.includes(pkg)) return require(pkg);
        else return require(localPath);
    } catch (err) {
        let pkgVer = (version && version !== '*' && version !== '') ? '@' + version : '';
        console.log(`[AUTO INSTALL] Đang cài package: ${pkg}${pkgVer}`);
        try {
            execSync(`npm install ${pkg}${pkgVer} --save --no-package-lock`, {
                stdio: 'inherit',
                env: process.env,
                shell: true,
                cwd: process.cwd()
            });
            // Require lại sau khi install
            if (listPackage.hasOwnProperty(pkg) || listbuiltinModules.includes(pkg)) return require(pkg);
            else return require(localPath);
        } catch (e) {
            console.log(`[ERROR] Không thể auto install package: ${pkg}${pkgVer}`, e);
            throw e;
        }
    }
}

module.exports = autoRequire;