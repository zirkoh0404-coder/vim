const express = require('express');
const fs = require('fs');
const session = require('express-session');
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'vim-super-league-2025-stable',
    resave: false,
    saveUninitialized: true
}));

const DATA_FILE = './data.json';
const ADMIN_KEY = "VIM-STAFF-2025"; 

const getData = () => {
    try {
        const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return { 
            players: [], matches: [], liveLink: "", groups: [], 
            leaderboards: { scorers: [], saves: [], assists: [] }, 
            records: [], 
            stories: [], 
            ...data 
        };
    } catch (e) {
        return { players: [], matches: [], leaderboards: { scorers: [], saves: [], assists: [] }, records: [], stories: [] };
    }
};

const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

app.use((req, res, next) => {
    const data = getData();
    const userPlayer = req.session.playerId ? data.players.find(p => p.id == req.session.playerId) : null;
    res.locals = { 
        ...res.locals, 
        ...data, 
        isAdmin: req.session.isAdmin || false,
        user: userPlayer,
        page: "" 
    };
    next();
});

// --- STORIES ADMIN ROUTES ---
app.post('/admin/add-story', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
    const data = getData();
    data.stories.push({ 
        id: Date.now(), 
        ...req.body,
        date: new Date().toLocaleDateString() 
    });
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/delete-story', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
    const data = getData();
    const index = req.body.storyIndex;
    if (index !== undefined) {
        data.stories.splice(index, 1);
        saveData(data);
    }
    res.redirect('/admin');
});

// --- AUTH ROUTES ---
app.post('/register', (req, res) => {
    const data = getData();
    const exists = data.players.find(p => p.name.toLowerCase() === req.body.name.toLowerCase());
    if (exists) return res.redirect('/market?error=Username already taken!');

    const newPlayer = { 
        id: Date.now(), 
        ...req.body, 
        goals: 0, assists: 0, saves: 0, mvps: 0,
        views: [], 
        cardImage: "", 
        verified: false 
    };

    data.players.push(newPlayer);
    saveData(data);
    req.session.playerId = newPlayer.id;
    res.redirect('/profile');
});

app.post('/login', (req, res) => {
    const data = getData();
    const { username, password } = req.body;
    
    const player = data.players.find(p => 
        p.name.toLowerCase() === username.toLowerCase() && 
        p.password === password
    );

    if (player) {
        req.session.playerId = player.id;
        res.redirect('/profile');
    } else {
        // FIX: Redirect to market with error instead of profile
        res.redirect('/market?error=Invalid username or password');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.post('/profile/delete', (req, res) => {
    if (!req.session.playerId) return res.redirect('/profile');
    const data = getData();
    data.players = data.players.filter(p => p.id != req.session.playerId);
    saveData(data);
    req.session.destroy(() => {
        res.redirect('/market');
    });
});

app.post('/market/view/:playerName', (req, res) => {
    if (!req.session.playerId) return res.json({ success: false });
    const data = getData();
    const player = data.players.find(p => p.name === req.params.playerName);
    if (player) {
        if (!player.views) player.views = [];
        if (!player.views.includes(req.session.playerId)) {
            player.views.push(req.session.playerId);
            saveData(data);
        }
        return res.json({ success: true, count: player.views.length });
    }
    res.json({ success: false });
});

// --- PAGES ---
app.get('/', (req, res) => {
    const data = getData();
    res.render('index', { 
        page: 'home',
        stories: data.stories || []
    });
});

app.get('/market', (req, res) => {
    const data = getData();
    const verifiedPlayers = data.players.filter(p => p.verified === true);
    res.render('market', { page: 'market', players: verifiedPlayers, error: req.query.error || null });
});

app.get('/matches', (req, res) => res.render('matches', { page: 'matches' }));

app.get('/match/:id', (req, res) => {
    const data = getData();
    const match = data.matches.find(m => m.id == req.params.id);
    if (!match) return res.redirect('/matches');
    res.render('match-details', { match, page: 'matches' });
});

app.get('/metrics', (req, res) => res.render('metrics', { page: 'metrics' }));
app.get('/league-records', (req, res) => res.render('league-records', { page: 'records' }));
app.get('/admin-login', (req, res) => res.render('admin-login', { error: null, page: 'admin' }));

app.get('/profile', (req, res) => {
    // FIX: Add safety check for logged out users
    if (!req.session.playerId) return res.redirect('/market?error=Please login first');
    res.render('profile', { page: 'profile', error: req.query.error || null });
});

app.get('/team/:groupId/:teamIndex', (req, res) => {
    const data = getData();
    const group = data.groups.find(g => g.id == req.params.groupId);
    const team = group ? group.teams[req.params.teamIndex] : null;
    if (!team) return res.redirect('/metrics');
    res.render('team-details', { team: team, group: group, page: 'metrics' });
});

app.get('/admin', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    const data = getData();
    res.render('admin', { 
        page: 'admin', 
        error: req.query.error || null,
        stories: data.stories || [] 
    });
});

// --- PROFILE UPDATES ---
app.post('/profile/update', (req, res) => {
    if (!req.session.playerId) return res.redirect('/profile');
    const data = getData();
    const pIdx = data.players.findIndex(p => p.id == req.session.playerId);
    if (pIdx !== -1) {
        data.players[pIdx] = { ...data.players[pIdx], ...req.body };
        saveData(data);
    }
    res.redirect('/profile');
});

// --- ADMIN MATCH UPDATE ROUTE ---
app.post('/admin/update-match-details', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
    const data = getData();
    const { 
        matchId, narrative, possessionA, possessionB, highlights, mvpName, mvpCardUrl, standouts,
        goalsA, assistsA, savesA, goalsB, assistsB, savesB,
        lineupA, lineupB
    } = req.body;

    const mIdx = data.matches.findIndex(m => m.id == matchId);
    if (mIdx !== -1) {
        const toArr = (val) => Array.isArray(val) ? val : [val];

        const teamAPlayers = [];
        if (req.body.teamAPlayer) {
            const names = toArr(req.body.teamAPlayer);
            const types = toArr(req.body.teamAType);
            const vals = toArr(req.body.teamAMainValue);
            const assists = toArr(req.body.teamAAssists);
            names.forEach((name, i) => {
                if(name) teamAPlayers.push({ name, type: types[i], value: vals[i], assists: assists[i] });
            });
        }

        const teamBPlayers = [];
        if (req.body.teamBPlayer) {
            const names = toArr(req.body.teamBPlayer);
            const types = toArr(req.body.teamBType);
            const vals = toArr(req.body.teamBMainValue);
            const assists = toArr(req.body.teamBAssists);
            names.forEach((name, i) => {
                if(name) teamBPlayers.push({ name, type: types[i], value: vals[i], assists: assists[i] });
            });
        }

        data.matches[mIdx].status = 'completed'; 
        
        data.matches[mIdx].details = {
            narrative, possessionA, possessionB, highlights, mvpName, mvpCardUrl, standouts,
            goalsA, assistsA, savesA, goalsB, assistsB, savesB,
            lineupA, lineupB, teamAPlayers, teamBPlayers
        };

        saveData(data);
        res.redirect('/admin');
    } else {
        res.redirect('/admin?error=Match not found');
    }
});

app.post('/admin/delete-match', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
    const data = getData();
    data.matches = data.matches.filter(m => m.id != req.body.matchId);
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/approve-player', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
    const data = getData();
    const player = data.players.find(p => p.id == req.body.playerId);
    if (player) { 
        player.verified = true; 
        player.cardImage = req.body.cardImage; 
        saveData(data); 
    }
    res.redirect('/admin');
});

app.post('/admin/update-market-player', (req, res) => {
    if (!req.session.isAdmin) return res.status(403).send("Unauthorized");
    const data = getData();
    const { username, goals, assists, saves, mvps, bio } = req.body;
    const pIdx = data.players.findIndex(p => p.name === username);
    if (pIdx !== -1) {
        data.players[pIdx].goals = parseInt(goals) || 0;
        data.players[pIdx].assists = parseInt(assists) || 0;
        data.players[pIdx].saves = parseInt(saves) || 0;
        data.players[pIdx].mvps = parseInt(mvps) || 0;
        data.players[pIdx].bio = bio; 
        saveData(data);
        res.redirect('/admin');
    } else { res.redirect('/admin?error=Player+Not+Found'); }
});

app.post('/admin/add-to-roster', (req, res) => {
    const data = getData();
    const { groupId, teamIndex, playerName, isManager } = req.body;
    const registeredPlayer = data.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
    if (!registeredPlayer) return res.redirect(`/admin?error=Player "${playerName}" not found!`);
    const group = data.groups.find(g => g.id == groupId);
    const team = group ? group.teams[teamIndex] : null;
    if (team) {
        if (!team.roster) team.roster = [];
        team.roster.push({ name: registeredPlayer.name, isManager: isManager === "true" });
        saveData(data);
        res.redirect('/admin');
    } else { res.redirect('/admin?error=Team not found'); }
});

app.post('/admin-login', (req, res) => {
    if (req.body.password === ADMIN_KEY) {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else { res.render('admin-login', { error: "WRONG KEY!", page: 'admin' }); }
});

app.post('/admin/add-record', (req, res) => {
    const data = getData();
    data.records.push({ id: Date.now(), ...req.body });
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/delete-record', (req, res) => {
    const data = getData();
    data.records = data.records.filter(r => r.id != req.body.recordId);
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/live', (req, res) => {
    const data = getData();
    data.liveLink = req.body.link;
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/add-match', (req, res) => {
    const data = getData();
    data.matches.push({ 
        id: Date.now(), 
        ...req.body,
        status: 'upcoming' 
    });
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/delete-player', (req, res) => {
    const data = getData();
    data.players = data.players.filter(p => p.id != req.body.playerId);
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/add-group', (req, res) => {
    const data = getData();
    data.groups.push({ id: Date.now(), name: req.body.name, teams: [] });
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/delete-group', (req, res) => {
    const data = getData();
    data.groups = data.groups.filter(g => g.id != req.body.groupId);
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/update-team', (req, res) => {
    const data = getData();
    const { groupId, teamIndex, teamName, logo, mp, wins, loses, pts } = req.body;
    const group = data.groups.find(g => g.id == groupId);
    if (group) {
        if (teamIndex !== "" && teamIndex !== undefined && group.teams[teamIndex]) {
            group.teams[teamIndex].mp = mp;
            group.teams[teamIndex].wins = wins;
            group.teams[teamIndex].loses = loses;
            group.teams[teamIndex].pts = pts;
        } else if (teamName) {
            group.teams.push({ name: teamName, logo: logo, mp: 0, wins: 0, loses: 0, pts: 0, roster: [] });
        }
    }
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/delete-from-roster', (req, res) => {
    const data = getData();
    const { groupId, teamIndex, playerIndex } = req.body;
    const group = data.groups.find(g => g.id == groupId);
    if (group && group.teams[teamIndex]) {
        group.teams[teamIndex].roster.splice(playerIndex, 1);
        saveData(data);
    }
    res.redirect('/admin');
});

app.post('/admin/update-stat', (req, res) => {
    const data = getData();
    const { type, statIndex, playerName, value } = req.body;
    if (data.leaderboards[type]) {
        if (statIndex !== "" && statIndex !== undefined && data.leaderboards[type][statIndex]) {
            data.leaderboards[type][statIndex].value = value;
        } else if (playerName) {
            data.leaderboards[type].push({ name: playerName, value: value });
        }
        data.leaderboards[type].sort((a, b) => b.value - a.value);
    }
    saveData(data);
    res.redirect('/admin');
});

app.post('/admin/delete-stat', (req, res) => {
    const data = getData();
    if (data.leaderboards[req.body.type]) data.leaderboards[req.body.type].splice(req.body.statIndex, 1);
    saveData(data);
    res.redirect('/admin');
});

// Render provides the port via process.env.PORT. Default to 3000 for local testing.
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`VIM Hub is LIVE on port ${PORT}`);
});

