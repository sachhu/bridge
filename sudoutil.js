#!/usr/bin/env node

import shelljs from 'shelljs'
import cli from 'cli'
import dotenv from 'dotenv'
import path from 'path';
import {
    chmodSync,
    chownSync,
    statSync
} from 'fs';
import {
    fileURLToPath
} from 'url';
import {
    spawn
} from 'child_process';

const __dirname = path.dirname(fileURLToPath(
    import.meta.url));
dotenv.config({
    path: path.join(__dirname, './.env')
});

const {
    cat,
    cd,
    exec,
    mv,
    rm,
    exit,
    ls,
    ShellString,
} = shelljs;

const env = Object.assign({}, {
    BASH_PATH: '/bin/bash',
    BASH_SU: 'su',
    BASH_KILL: 'kill',
    NGINX_PATH: '/etc/nginx/conf.d/$.conf',
    NGINX_OUT: '/etc/nginx/conf.d/$.conf',
    NGINX_BIN: 'nginx',
    NGINX_START: 'systemctl start nginx',
    NGINX_TMP: path.join(__dirname, '.tmp/nginx'),
    IPTABLES_PATH: '/etc/sysconfig/iptables',
    IPTABLES_OUT: '/etc/sysconfig/iptables',
    IPTABLES_SAVE: 'iptables-save',
    IPTABLES_LOAD: 'iptables-restore',
    IP6TABLES_PATH: '/etc/sysconfig/ip6tables',
    IP6TABLES_OUT: '/etc/sysconfig/ip6tables',
    IP6TABLES_SAVE: 'ip6tables-save',
    IP6TABLES_LOAD: 'ip6tables-restore',
    IPTABLES_TMP: path.join(__dirname, '.tmp/iptables'),
    IP6TABLES_TMP: path.join(__dirname, '.tmp/ip6tables'),
    IPTABLES_WHITELIST_EXEC: 'sh ' + path.join(__dirname, 'src/whitelist/refresh.sh'),
    NAMED_PATHS: '/var/named/$.hosts',
    NAMED_OUT: '/var/named/$.hosts',
    NAMED_CHECK: 'named-checkzone',
    NAMED_RELOAD: 'rndc reload $',
    NAMED_RESYNC: 'rndc retransfer $',
    NAMED_TMP: path.join(__dirname, '.tmp/named'),
    VIRTUALMIN: 'virtualmin',
    PHPFPM_LOCATION: '/usr/sbin/php-fpm',
    PHPFPM_REMILIST: '/opt/remi/',
    PHPFPM_REMILOC: '/opt/remi/$/root/usr/sbin/php-fpm',
    SHELLCHECK_TMP: path.join(__dirname, '.tmp/check'),
    SHELLTEST_TMP: path.join(__dirname, '.tmp/test'),
    SCRIPT: path.join(__dirname, 'sudoutil.js'),
}, process.env);

/**
 * @param {import("fs").PathLike} filePath
 */
function fixOwner(filePath) {
    const {
        uid,
        gid
    } = statSync(path.join(__dirname, './sudoutil.js'));
    chownSync(filePath, uid, gid);
    chmodSync(filePath, 0o750);
}

cd(__dirname); // making sure because we're in sudo
let arg;
switch (cli.args.shift()) {
    case 'NGINX_GET':
        arg = cli.args.shift();
        cat(env.NGINX_PATH.replace('$', arg)).to(env.NGINX_TMP);
        fixOwner(env.NGINX_TMP);
        exit(0);
    case 'NGINX_SET':
        arg = cli.args.shift();
        let DEST = env.NGINX_OUT.replace('$', arg);
        mv(DEST, DEST + '.bak');
        cat(env.NGINX_TMP).to(DEST);
        if (exec(`${env.NGINX_BIN} -t`).code !== 0) {
            rm(DEST);
            mv(DEST + '.bak', DEST);
            exit(1);
        }
        rm(DEST + '.bak');
        exec(`${env.NGINX_BIN} -s reload`);
        exit(0);
    case 'NGINX_START':
        exec(env.NGINX_START);
        exit(0);
    case 'IPTABLES_GET':
        cat(env.IPTABLES_PATH).to(env.IPTABLES_TMP);
        fixOwner(env.IPTABLES_TMP);
        exit(0);
    case 'IP6TABLES_GET':
        cat(env.IP6TABLES_PATH).to(env.IP6TABLES_TMP);
        fixOwner(env.IP6TABLES_TMP);
        exit(0);
    case 'IPTABLES_SET':
        // making sure whitelist set is exist
        exec(env.IPTABLES_WHITELIST_EXEC);
        if (cat(env.IPTABLES_TMP).exec(`${env.IPTABLES_LOAD} -t`).code !== 0)
            exit(1);
        cat(env.IPTABLES_TMP).to(env.IPTABLES_OUT);
        cat(env.IPTABLES_OUT).exec(env.IPTABLES_LOAD);
        exit(0);
    case 'IP6TABLES_SET':
        // making sure whitelist set is exist
        exec(env.IPTABLES_WHITELIST_EXEC);
        if (cat(env.IP6TABLES_TMP).exec(`${env.IP6TABLES_LOAD} -t`).code !== 0)
            exit(1);
        cat(env.IP6TABLES_TMP).to(env.IP6TABLES_OUT);
        cat(env.IP6TABLES_OUT).exec(env.IP6TABLES_LOAD);
        exit(0);
    case 'NAMED_GET':
        arg = cli.args.shift();
        cat(env.NAMED_PATHS.replace('$', arg)).to(env.NAMED_TMP);
        fixOwner(env.NAMED_TMP);
        exit(0);
    case 'NAMED_SET':
        arg = cli.args.shift();
        if (exec(`${env.NAMED_CHECK} ${arg} ${env.NAMED_TMP}`).code !== 0)
            exit(1);
        cat(env.NAMED_TMP).to(env.NAMED_OUT.replace('$', arg));
        exit(exec(env.NAMED_RELOAD.replace('$', arg)).code);
    case 'NAMED_SYNC':
        arg = cli.args.shift();
        exit(exec(env.NAMED_RESYNC.replace('$', arg)).code);
    case 'VIRTUALMIN':
        arg = cli.args.join(' ');
        exit(exec(env.VIRTUALMIN + " " + arg).code);
    case 'SHELL_KILL':
        arg = cli.args.shift();
        exec(`${env.BASH_KILL} ${arg}`, { shell: '' }).code;
    case 'SHELL_INTERACTIVE':
        arg = cli.args.shift();
        var su = spawn(env.BASH_SU, [arg, '-s', env.BASH_PATH, '-P', '-l'], {
            stdio: 'inherit'
        });
        su.on('close', function (code) {
            exit(code);
        });
        setTimeout(() => {
            // just in case
            if (!su.killed)
                su.kill();
        }, 1000 * 60 * 60).unref();
        break;
    case 'SHELL_CHECK':
        var fpmlist = ls(env.PHPFPM_REMILIST).filter((f) => f.match(/php\d\d/));
        var services = [
            'nginx',
            'php-fpm',
            ...[...fpmlist.map((f) => f + '-php-fpm')],
            'iptables',
            'ip6tables',
            'named',
            'webmin',
            'sshd',
            'mariadb',
            'postgresql',
        ]
        var statutes = exec(`systemctl is-failed ${services.join(' ')}`, { silent: true }).split('\n').filter((s) => s !== '');

        var exitcode = 0;
        if (statutes.some((s) => s !== 'active'))
            exitcode = 1;
        ShellString(JSON.stringify({
            timestamp: Date.now(),
            status: exitcode === 0 ? 'OK' : 'ERROR',
            statuses: Object.fromEntries(services.map((k, i) => [k, statutes[i]]))
        })).to(env.SHELLCHECK_TMP);
        exit(0);
    case 'SHELL_TEST':
        var nginx = exec(`${env.NGINX_BIN} -t`, { silent: true });
        var fpmlist = ls(env.PHPFPM_REMILIST).filter((f) => f.match(/php\d\d/));
        var fpmpaths = [...fpmlist.map((f) => env.PHPFPM_REMILOC.replace('$', f)), env.PHPFPM_LOCATION];
        var fpms = fpmpaths.map((f) => exec(`${f} -t`, { silent: true }));

        var exitcode = 0;
        if (nginx.code !== 0 ||
            fpms.some((f) => f.code !== 0))
            exitcode = 1;
        ShellString(JSON.stringify({
            timestamp: Date.now(),
            status: exitcode === 0 ? 'OK' : 'ERROR',
            codes: {
                nginx: nginx.code,
                fpms: fpms.map((f) => f.code),
            },
            logs: {
                nginx: nginx.stderr,
                fpms: fpms.map((f) => f.stderr),
            },
        })).to(env.SHELLTEST_TMP);
        exit(0);
    default:
        console.error(`Unknown Mode`);
        exit(1);
}