import request from 'request-promise-native';
import fs from 'fs-extra';

import clanMembers from './data/destiny-clan-members';

const headerRow = [
    'Match ID',
    'Timestamp',
    'Activity',
    'Map',
    'Player',
    'Fireteam Size',
    'Fireteam Members',
    'Team',
    'Result',
    'Team Score',
    'Enemy Team Score',
    'Score',
    'Kills',
    'Assists',
    'Deaths',
    'Completed',
].join(',') + '\n';

(async () => {
    await fs.ensureDir('./data/cache');
    await fs.ensureDir('./data/out');

    try {
        await fs.unlink(`./data/out/__clan__.csv`);
    } catch (err) {}

    await fs.appendFile(`./data/out/__clan__.csv`, headerRow, 'utf8');

    for (let player of clanMembers) {
        let network = player.DestinyUserInfo.membershipType;
        let id = player.DestinyUserInfo.membershipId;
        let name = player.DestinyUserInfo.displayName;

        try {
            await fs.unlink(`./data/out/${name}.csv`);
        } catch (err) {}

        console.log(`Fetching info for: ${name}...`);

        let sessionInfo = await request({
            url: `http://destinytracker.com/d2/api/profile/${network}/${id}/sessions`,
            json: true,
        });

        await fs.writeFile(`./data/out/${name}.csv`, headerRow, 'utf8');

        for (let session of sessionInfo.sessions) {
            for (let match of session.matches) {
                let matchId = match.activityDetails.instanceId;
                let cacheFile = `./data/cache/${matchId}.json`;

                let matchInfo;
                try {
                    matchInfo = JSON.parse(await fs.readFile(cacheFile, 'utf8'));
                } catch (err) {
                    matchInfo = await request({
                        url: `http://destinytracker.com/d2/api/pgcr/${matchId}`,
                        json: true,
                    });

                    await fs.writeFile(cacheFile, JSON.stringify(matchInfo), 'utf8');
                }

                let timestamp = matchInfo.period;
                let activity = matchInfo.activityDetails.readable.activityTypeName;
                let map = matchInfo.activityDetails.readable.mapName;

                let playerEntry = matchInfo.entries.find(entry => name === entry.player.destinyUserInfo.displayName);

                let playerTeam = playerEntry.values.team.basic.displayValue;

                let fireTeamSize = matchInfo.entries.reduce((size, entry) => {
                    if (playerEntry.values.fireteamId.basic.value === entry.values.fireteamId.basic.value) {
                        size++;
                    }

                    return size;
                }, 0);

                let fireteamMembers = matchInfo.entries.reduce((members, entry) => {
                    if (playerEntry.values.fireteamId.basic.value === entry.values.fireteamId.basic.value) {
                        members.push(entry.player.destinyUserInfo.displayName);
                    }

                    return members;
                }, []);

                let playerTeamStanding = playerEntry.values.standing.basic.displayValue;
                let playerTeamScore = playerEntry.values.teamScore.basic.value;

                let enemyTeamScore;
                try { // Sometimes this fails; perhaps if teams disconnect before match start???
                    enemyTeamScore = matchInfo.teams.find(team => playerTeam !== team.teamName).score.basic.value;
                } catch (err) {
                    try { // Sometimes this works if we've failed above; have no guesses for this one.
                        enemyTeamScore = matchInfo.entries.find(entry => playerTeam !== entry.values.team.basic.displayValue).score.basic.value;
                    } catch (err) {
                        // If we still can't find the score, just zero it.
                        enemyTeamScore = 0;
                    }
                }

                let score = playerEntry.values.score.basic.value;
                let kills = playerEntry.values.kills.basic.value;
                let assists = playerEntry.values.assists.basic.value;
                let deaths = playerEntry.values.deaths.basic.value;
                let completed = playerEntry.values.completed.basic.displayValue;

                let row = [
                    matchId,
                    timestamp,
                    activity,
                    map,
                    name,
                    fireTeamSize,
                    fireteamMembers.sort().join('+'),
                    playerTeam,
                    playerTeamStanding,
                    playerTeamScore,
                    enemyTeamScore,
                    score,
                    kills,
                    assists,
                    deaths,
                    completed,
                ].join(',') + '\n';

                await fs.appendFile(`./data/out/${name}.csv`, row, 'utf8');
                await fs.appendFile(`./data/out/__clan__.csv`, row, 'utf8');
            }
        }
    }
})();
