// Adapted from https://github.com/Cerusa/swgt-swex-plugin
// TODO:

const { app, shell } = require('electron'),
    eol = require('os').EOL,
    fetch = require('node-fetch'),
    fs = require('fs'),
    path = require('path');

// const endPoint = 'http://localhost:8081',
const endPoint = 'https://devilmon.me',
    localizedPluginName = '위아래 업로더',
    logSubDir = 'devilmon logs',
    pluginDescription = 'This plugin uploads siege data to devilmon.me.',
    pluginName = 'Devilmon Companion',
    pluginVersion = '1.0.0';

var guildId,
    latestVersion,
    messageTimer = new Date().getTime();

module.exports = {
    defaultConfig: {
        enabled: true,
        localization: true,
        accessKey: 'test',
        logEvents: false
    },
    defaultConfigDetails: {
        localization: { label: '한국어 활성화 (Use Korean for logs)' },
        accessKey: { label: '접근 코드를 입력해주세요 (Enter access Key):', type: 'input' },
        logEvents: { label: '파일로 저장 (Save logs)' }
    },
    pluginName,
    pluginDescription,
    init(proxy, config) {
        const logPath = path.join(config.Config.App.filesPath, logSubDir);
        this.checkForUpdates(proxy, config.Config.Plugins[this.pluginName].localization);

        if (!fs.existsSync(logPath))
            fs.mkdirSync(logPath);

        app.on('will-quit', () => {
            // if (config.Config.Plugins[this.pluginName].deleteFileOnQuit) {
            //     fs.rmSync(logPath, { recursive: true });
            //     fs.mkdirSync(logPath);
            // }
        });

        this.verifyAccessKey(config.Config.Plugins[this.pluginName].accessKey, config.Config.Plugins[this.pluginName].localization)
            .then(receivedGuildId => {
                guildId = receivedGuildId;
                if (config.Config.Plugins[this.pluginName].enabled)
                    proxy.log({
                        type: 'debug', source: 'plugin', name: this.pluginName,
                        message: 'retrieved guild id: ' + guildId
                    });

                proxy.on('apiCommand', (req, res) => {
                    if (pluginVersion === latestVersion && config.Config.Plugins[this.pluginName].enabled) {
                        if (config.Config.Plugins[pluginName].logEvents)
                            this.logCommand(logPath, req, res);

                        proxy.log({
                            type: 'debug', source: 'plugin', name: this.pluginName,
                            message: req.command
                        });
                    }
                });

                [
                    'BattleGuildSiegeStart_v2',
                    'BattleGuildSiegeResult',
                    'getGuildAttendInfo',
                    'GetGuildInfo',
                    'GetGuildInfoByName',
                    'GetGuildInfoForChat',
                    'GetGuildSiegeBaseDefenseUnitList',
                    'GetGuildSiegeBaseDefenseUnitListPreset',
                    'GetGuildSiegeBattleLog',
                    'GetGuildSiegeBattleLogByDeckId',
                    'GetGuildSiegeBattleLogByWizardId',
                    'GetGuildSiegeContestMatchTable',
                    'GetGuildSiegeDefenseDeckByWizardId',
                    'GetGuildSiegeMatchupInfo',
                    'GetGuildSiegeMatchupInfoForFinished',
                    'GetGuildSiegeRankingInfo',
                    'HubUserLogin'
                ]
                    .forEach(eventName => {
                        proxy.on(eventName, (req, res) => {
                            if (config.Config.Plugins[this.pluginName].enabled) {
                                if (pluginVersion === latestVersion)
                                    this.onProxyEvent(eventName, req, res, proxy, config, logPath);
                                else
                                    if (new Date().getTime() - messageTimer > 10000) {
                                        messageTimer = new Date().getTime();
                                        proxy.log({
                                            type: 'warning', source: 'plugin', name: localization ? localizedPluginName : this.pluginName,
                                            message: config.Config.Plugins[this.pluginName].localization ? '버전이 맞지않아 동기화가 취소되었습니다. 새 버전을 설치해주세요!' : 'Data upload has been cancelled due to version mismatch. Please update plugin to the latest version.'
                                        });
                                    }
                            }
                        });
                    });
            }).catch(error => {
                if (config.Config.Plugins[this.pluginName].enabled)
                    proxy.log({
                        type: 'error', source: 'plugin', name: config.Config.Plugins[this.pluginName].localization ? localizedPluginName : this.pluginName,
                        message: error
                    });
            });

        cache = {};
        cacheP = {};
        cachePDuration = {};
        cachePTimerSettings = [
            { command: 'GetGuildInfo', timer: 60000 },
            { command: 'GetGuildSiegeMatchupInfo', timer: 60000 },
            { command: 'GetGuildSiegeRankingInfo', timer: 300000 },
        ];
    },
    checkForUpdates(proxy, localization) {
        fetch(endPoint + '/siege/getVersion')
            .then(res => {
                if (res.status === 200)
                    res.text().then(version => {
                        latestVersion = version;
                        if (version === pluginVersion) {
                            proxy.log({
                                type: 'success', source: 'plugin', name: localization ? localizedPluginName : this.pluginName,
                                message: localization ? '최신 버전을 사용중입니다.' : 'This plugin is up to date!'
                            });
                        } else {
                            shell.openExternal('https://github.com/Jin-hjs/sw-exporter-devilmon-companion/releases/latest');
                            proxy.log({
                                type: 'warning', source: 'plugin', name: localization ? localizedPluginName : this.pluginName,
                                message: localization ? '구버전을 사용중입니다. 새 버전으로 업데이트 해주시기 바랍니다.' : 'This plugin is outdated. Please download the lastest version.'
                            });
                        }
                    }).catch(error => {
                        proxy.log({
                            type: 'error', source: 'plugin', name: localization ? localizedPluginName : this.pluginName,
                            message: localization ? `알수없는 오류가 발생했습니다. 에러: ${error}` : `Unexpected error: ${error}`
                        });
                    });
                else
                    proxy.log({
                        type: 'error', source: 'plugin', name: localization ? localizedPluginName : this.pluginName,
                        message: localization ? '플러그인 버전을 확인하는데 실패했습니다.' : 'Failed to check for updates.'
                    });
            });
    },
    hasCacheMatch(proxy, req, res) {
        const resCopy = JSON.parse(JSON.stringify(res)),
            command = resCopy?.log_type ? `battleLog${resCopy.log_type === 1 ? 'Of' : 'De'}fense` : resCopy.command;

        if (resCopy?.ts_val) delete resCopy.ts_val;
        if (resCopy?.tvalue) delete resCopy.tvalue;
        if (resCopy?.tvaluelocal) delete resCopy.tvaluelocal;

        if (command in cacheP) {
            if (JSON.stringify(cacheP[command]) === JSON.stringify(resCopy)) {
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Matched cache:  " + command });
                return true;
            } else
                proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "No match cache:  " + command });

            for (var k in cachePTimerSettings) {
                if (cachePTimerSettings[k].command === command) {
                    var currentTime = new Date().getTime();
                    var timeDifference = currentTime - cachePDuration[command];

                    proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "cachePTimerSettings[k].timer: " + cachePTimerSettings[k].timer });

                    if (timeDifference < cachePTimerSettings[k].timer) {
                        timerMinutes = cachePTimerSettings[k].timer / 60000;
                        proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Time between last packet < " + timerMinutes + " minute(s) for:  " + command });
                        return true;
                    }
                }
            }
        } else
            proxy.log({ type: 'debug', source: 'plugin', name: this.pluginName, message: "Not in cache:  " + command });

        cacheP[command] = resCopy;
        cachePDuration[command] = new Date().getTime();

        return false;
    },
    logCommand(logPath, req, res) {
        const { command } = req;

        let logfile = fs.createWriteStream(path.join(logPath, `${command}_${new Date().getTime()}.json`), {
            flags: 'a',
            autoClose: true,
        });

        logfile.write(
            '{'.concat(
                `"${command}": "`,
                Date(),
                '",',
                eol,
                eol,
                '"Request": ',
                eol,
                JSON.stringify(req),
                ',',
                eol,
                eol,
                '"Response": ',
                eol,
                JSON.stringify(res),
                eol,
                '}'
            )
        );

        logfile.end();
    },
    onProxyEvent(eventName, req, res, proxy, config, logPath) {
        const localization = config.Config.Plugins[this.pluginName].localization;
        var sendReq = false;

        switch (eventName) {
            case 'BattleGuildSiegeStart_v2':
                this.parseObject(res);
                break;

            case 'BattleGuildSiegeResult':
                sendReq = true;
                break;

            case 'getGuildAttendInfo':
                break;

            case 'GetGuildInfo':
                break;

            case 'GetGuildInfoByName':
                break;

            case 'GetGuildInfoForChat':
                break;

            case 'GetGuildSiegeBaseDefenseUnitList':
                break;

            case 'GetGuildSiegeBaseDefenseUnitListPreset':
                break;

            case 'GetGuildSiegeBattleLog':
                break;

            case 'GetGuildSiegeBattleLogByDeckId': //Defense Log Link
                break;

            case 'GetGuildSiegeBattleLogByWizardId':
                break;

            case 'GetGuildSiegeContestMatchTable':
                break;

            case 'GetGuildSiegeDefenseDeckByWizardId':
                break;

            case 'GetGuildSiegeMatchupInfo':
                res.guilds = [];

                var blueGID = -1,
                    bluePID = 0,
                    redPID = 0,
                    yellowPID = 0;

                for (const wizard in res.wizard_info_list)
                    if (req.wizard_id === res.wizard_info_list[wizard].wizard_id)
                        blueGID = res.wizard_info_list[wizard].guild_id;

                for (const guild in res.guild_list)
                    if (blueGID === res.guild_list[guild].guild_id) {
                        bluePID = res.guild_list[guild].pos_id;
                        redPID = (bluePID + 1) % 3 + 1;
                        yellowPID = bluePID % 3 + 1;
                    }

                for (const guild in res.guild_list) {
                    const guildInfo = {};

                    guildInfo.guild_id = res.guild_list[guild].guild_id;
                    guildInfo.pos_id = res.guild_list[guild].pos_id;
                    guildInfo.towers = [];

                    switch (guildInfo.pos_id) {
                        case yellowPID:
                            guildInfo.color = "yellow";
                            break;
                        case redPID:
                            guildInfo.color = "red";
                            break;
                        case bluePID:
                        default:
                            guildInfo.color = "blue";
                    }

                    for (var base in res.base_list)
                        if (res.base_list[base].guild_id == res.guild_list[guild].guild_id && res.base_list[base].base_type > 1)
                            guildInfo.towers.push(res.base_list[base].base_number);

                    res.guilds.push(guildInfo);
                }
                break;

            case 'GetGuildSiegeMatchupInfoForFinished':
                break;

            case 'GetGuildSiegeRankingInfo':
                break;

            case 'HubUserLogin':
                return;

            default:
                proxy.log({
                    type: 'error', source: 'plugin', name: localization ? localizedPluginName : this.pluginName,
                    message: localization ? `${eventName}: 알수없는 오류가 발생했습니다.` : `${eventName}: You should not be seeing this.`
                });
        }

        if (this.hasCacheMatch(proxy, req, res))
            return;

        this.sendData(proxy, config, req, res, sendReq);
        this.logCommand(logPath, req, res);
    },
    parseObject(obj) {
        if (Array.isArray(obj)) {
            if (obj.length > 0 && Array.isArray(obj[0])) {
                const newObj = {};

                for (let i = 0; i < obj.length; i++)
                    newObj[i] = obj[i];

                return newObj;
            } else
                for (let i = 0; i < obj.length; i++)
                    obj[i] = this.parseObject(obj[i]);
        }
        else if (typeof obj === 'object')
            for (const key in obj)
                obj[key] = this.parseObject(obj[key]);

        return obj;
    },
    sendData(proxy, config, req, res, sendRequest = false) {
        const uploadToServer = () => {
            fetch(endPoint + '/siege/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accessKey: config.Config.Plugins[this.pluginName].accessKey,
                    data: sendRequest ? req : res,
                    guildId: guildId,
                    type: req.command
                })
            }).then(response => {
                if (response.status === 200)
                    proxy.log({
                        type: 'success', source: 'plugin', name: config.Config.Plugins[this.pluginName].localization ? localizedPluginName : this.pluginName,
                        message: config.Config.Plugins[this.pluginName].localization ? `${req.command}를 서버에 업로드하였습니다.` : `${req.command} has been uploaded to the server.`
                    });
                else
                    proxy.log({
                        type: 'error', source: 'plugin', name: config.Config.Plugins[this.pluginName].localization ? localizedPluginName : this.pluginName,
                        message: config.Config.Plugins[this.pluginName].localization ? `업로드 오류! 서버가 ${response.status}로 응답했습니다.` : `Server responded with ${response.status}.`
                    });
            });
        }

        if (!guildId)
            if (!config.Config.Plugins[this.pluginName].accessKey)
                return;
            else
                this.verifyAccessKey(config.Config.Plugins[this.pluginName].accessKey, config.Config.Plugins[this.pluginName].localization)
                    .then(receivedGuildId => {
                        guildId = receivedGuildId;
                        uploadToServer();
                        return;
                    });

        uploadToServer();
    },
    verifyAccessKey(accessKey, localization = false) {
        return new Promise((res, rej) => {
            if (!accessKey)
                rej(localization ?
                    '접근 코드가 입력되지 않았습니다. 위아래 검색엔진에서 접근 코드를 확인 후 설정 > Devilmon Companion에 입력해주세요.' :
                    'You have not entered the access key. Please copy & paste your access key in Settings > Devilmon Companion.'
                );
            else
                fetch(endPoint + '/siege/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        accessKey: accessKey
                    })
                }).then(response => {
                    if (response.status === 200)
                        res(response.text());
                    else
                        rej(localization ?
                            `접근 코드를 확인할수 없습니다. 서버가 코드 ${response.status}(으)로 응답했습니다.` :
                            `Unable to verify access key. The server has responded with status code of ${response.status}.`);
                }).catch(error =>
                    rej(localization ?
                        `접근 코드 확인중에 오류가 발생했습니다: ${error}` :
                        `Unexpected error has occured while verifying access key: ${error}`)
                );
        });
    },
    writeToFile(proxy, req, res, prefix) {
        if (!config.Config.Plugins[pluginName].enabled || !config.Config.Plugins[pluginName].logEvents)
            return;

        var outFile = fs.createWriteStream(
            path.join(config.Config.App.filesPath, 'swgt logs', `${prefix}-${res.command}-${new Date().getTime()}.json`),
            {
                autoClose: true,
                flags: 'w'
            });

        outFile.write(JSON.stringify(res, true, 2));
        outFile.end();
    }
};