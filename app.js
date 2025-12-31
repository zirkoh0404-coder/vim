const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const app = express();

// --- MONGODB CONNECTION ---
const mongoURI = process.env.MONGO_URI || "mongodb+srv://vimsuperleague:alan78600@vimsuperleague.ic6a7ck.mongodb.net/vimhub?retryWrites=true&w=majority&appName=VIMSUPERLEAGUE";

mongoose.connect(mongoURI)
    .then(() => console.log("🔥 Connected to MongoDB Atlas! Data is now permanent."))
    .catch(err => console.log("❌ MongoDB Connection Error:", err));

// --- MIDDLEWARE ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'vim-super-league-2025-stable',
    resave: false,
    saveUninitialized: true
}));

const ADMIN_KEY = "VIM-STAFF-2025"; 

// --- MODELS ---
const Player = mongoose.model('Player', new mongoose.Schema({
    name: String, discord: String, password: { type: String, required: true },
    cardImage: { type: String, default: "" }, verified: { type: Boolean, default: false },
    goals: { type: Number, default: 0 }, assists: { type: Number, default: 0 },
    saves: { type: Number, default: 0 }, mvps: { type: Number, default: 0 },
    experience: String, bio: String, views: [String]
}));

const Match = mongoose.model('Match', new mongoose.Schema({
    teamA: String, teamB: String, logoA: String, logoB: String,
    time: String, tags: String, isLive: Boolean, status: { type: String, default: 'upcoming' },
    details: Object
}));

const Group = mongoose.model('Group', new mongoose.Schema({
    name: String,
    teams: [{ name: String, logo: String, mp: Number, wins: Number, loses: Number, pts: Number, roster: Array }]
}));

const Info = mongoose.model('Info', new mongoose.Schema({
    liveLink: { type: String, default: "" },
    leaderboards: { 
        scorers: { type: Array, default: [] }, 
        saves: { type: Array, default: [] }, 
        assists: { type: Array, default: [] } 
    },
    records: { type: Array, default: [] },
    stories: { type: Array, default: [] }
}));

// Helper to get Global Settings
async function getInfo() {
    let info = await Info.findOne();
    if (!info) info = await Info.create({});
    return info;
}

// Global Middleware
app.use(async (req, res, next) => {
    try {
        const info = await getInfo();
        const players = await Player.find();
        const user = req.session.playerId ? await Player.findById(req.session.playerId) : null;
        
        res.locals = { 
            ...res.locals, 
            players: players,
            matches: await Match.find(),
            groups: await Group.find(),
            liveLink: info.liveLink,
            leaderboards: info.leaderboards,
            records: info.records,
            stories: info.stories,
            isAdmin: req.session.isAdmin || false,
            user: user,
            page: "" 
        };
        next();
    } catch (err) { next(err); }
});

// --- PAGES ---
app.get('/', async (req, res) => res.render('index', { page: 'home' }));
app.get('/market', async (req, res) => {
    const players = await Player.find({ verified: true });
    res.render('market', { page: 'market', players, error: req.query.error || null });
});
app.get('/matches', (req, res) => res.render('matches', { page: 'matches' }));
app.get('/match/:id', async (req, res) => {
    const match = await Match.findById(req.params.id);
    if (!match) return res.redirect('/matches');
    res.render('match-details', { match, page: 'matches' });
});
app.get('/metrics', (req, res) => res.render('metrics', { page: 'metrics' }));
app.get('/league-records', (req, res) => res.render('league-records', { page: 'records' }));
app.get('/info', (req, res) => res.render('info', { page: 'info' }));
app.get('/admin-login', (req, res) => res.render('admin-login', { error: null, page: 'admin' }));
app.get('/profile', (req, res) => {
    if (!req.session.playerId) return res.redirect('/market?error=Please login first');
    res.render('profile', { page: 'profile', error: req.query.error || null });
});
app.get('/admin', (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    res.render('admin', { page: 'admin', error: req.query.error || null });
});

// --- AUTH ROUTES ---
app.post('/register', async (req, res) => {
    const exists = await Player.findOne({ name: new RegExp(`^${req.body.name}$`, 'i') });
    if (exists) return res.redirect('/market?error=Username already taken!');
    const newPlayer = await Player.create({ ...req.body });
    req.session.playerId = newPlayer._id;
    res.redirect('/profile');
});
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const player = await Player.findOne({ name: new RegExp(`^${username}$`, 'i'), password });
    if (player) { req.session.playerId = player._id; res.redirect('/profile'); }
    else { res.redirect('/market?error=Invalid username or password'); }
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/'); });

// --- PLAYER PROFILE UPDATE ---
app.post('/profile/update', async (req, res) => {
    try {
        if (!req.session.playerId) return res.redirect('/market?error=Please login first');
        const { bio, experience, discord } = req.body;
        await Player.findByIdAndUpdate(req.session.playerId, { bio, experience, discord });
        res.redirect('/profile');
    } catch (err) { res.redirect('/profile?error=Update failed'); }
});

// --- ADMIN / DATA UPDATES ---
app.post('/admin/live', async (req, res) => {
    const info = await getInfo();
    info.liveLink = req.body.link;
    await info.save();
    res.redirect('/admin');
});

app.post('/admin/add-match', async (req, res) => {
    await Match.create({ ...req.body, status: 'upcoming' });
    res.redirect('/admin');
});

app.post('/admin/update-match-details', async (req, res) => {
    const { matchId } = req.body;
    const toArr = (val) => Array.isArray(val) ? val : (val ? [val] : []);
    const teamAPlayers = toArr(req.body.teamAPlayer).map((name, i) => ({
        name, type: toArr(req.body.teamAType)[i], value: toArr(req.body.teamAMainValue)[i], assists: toArr(req.body.teamAAssists)[i]
    }));
    const teamBPlayers = toArr(req.body.teamBPlayer).map((name, i) => ({
        name, type: toArr(req.body.teamBType)[i], value: toArr(req.body.teamBMainValue)[i], assists: toArr(req.body.teamBAssists)[i]
    }));
    await Match.findByIdAndUpdate(matchId, { status: 'completed', details: { ...req.body, teamAPlayers, teamBPlayers } });
    res.redirect('/admin');
});

app.post('/admin/approve-player', async (req, res) => {
    await Player.findByIdAndUpdate(req.body.playerId, { verified: true, cardImage: req.body.cardImage });
    res.redirect('/admin');
});

app.post('/admin/update-market-player', async (req, res) => {
    const { username, goals, assists, saves, mvps, bio, cardImage } = req.body;
    await Player.findOneAndUpdate({ name: username }, {
        goals: parseInt(goals) || 0, assists: parseInt(assists) || 0,
        saves: parseInt(saves) || 0, mvps: parseInt(mvps) || 0,
        bio, cardImage
    });
    res.redirect('/admin');
});

app.post('/admin/add-group', async (req, res) => {
    await Group.create({ name: req.body.name, teams: [] });
    res.redirect('/admin');
});

app.post('/admin/update-team', async (req, res) => {
    const { groupId, teamIndex, teamName, logo, mp, wins, loses, pts } = req.body;
    const group = await Group.findById(groupId);
    if (group) {
        if (teamIndex !== "" && group.teams[teamIndex]) { Object.assign(group.teams[teamIndex], { mp, wins, loses, pts }); }
        else if (teamName) { group.teams.push({ name: teamName, logo, mp: 0, wins: 0, loses: 0, pts: 0, roster: [] }); }
        await group.save();
    }
    res.redirect('/admin');
});

// --- TEAM DETAILS PAGE ---
app.get('/team/:groupId/:teamIndex', async (req, res) => {
    try {
        const { groupId, teamIndex } = req.params;
        const group = await Group.findById(groupId);
        
        // Safety check: make sure the group and the specific team exist
        if (!group || !group.teams[teamIndex]) {
            return res.redirect('/metrics?error=Team not found');
        }

        const team = group.teams[teamIndex];

        // This renders your new template and passes the 'team' and 'group' data to it
        res.render('team-details', { 
            team, 
            group, 
            page: 'metrics' 
        });
    } catch (err) {
        console.error("Team Page Error:", err);
        res.redirect('/metrics');
    }
});

app.post('/admin/add-to-roster', async (req, res) => {
    const { groupId, teamIndex, playerName, isManager } = req.body;
    const player = await Player.findOne({ name: new RegExp(`^${playerName}$`, 'i') });
    if (!player) return res.redirect(`/admin?error=Player not found`);
    const group = await Group.findById(groupId);
    if (group && group.teams[teamIndex]) {
        group.teams[teamIndex].roster.push({ name: player.name, isManager: isManager === "true" });
        await group.save();
    }
    res.redirect('/admin');
});

app.post('/admin/delete-from-roster', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    try {
        const { groupId, teamIndex, playerIndex } = req.body;
        const group = await Group.findById(groupId);
        
        if (group && group.teams[teamIndex] && group.teams[teamIndex].roster) {
            // Remove the player at that specific position in the roster array
            group.teams[teamIndex].roster.splice(playerIndex, 1);
            
            // Critical: Tell MongoDB that the roster array has changed
            group.markModified(`teams.${teamIndex}.roster`);
            await group.save();
        }
        
        res.redirect('/admin');
    } catch (err) {
        console.error("Roster Delete Error:", err);
        res.redirect('/admin?error=RosterDeleteFailed');
    }
});

app.post('/admin/add-story', async (req, res) => {
    const info = await getInfo();
    info.stories.push({ ...req.body, id: Date.now().toString(), date: new Date().toLocaleDateString() });
    await info.save();
    res.redirect('/admin');
});

app.post('/admin/add-record', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    const info = await getInfo();
    info.records.push({ ...req.body, id: Date.now().toString() });
    await info.save();
    res.redirect('/admin');
});

app.post('/admin/update-stat', async (req, res) => {
    const { type, statIndex, playerName, value } = req.body;
    const info = await getInfo();
    if (statIndex !== "" && info.leaderboards[type][statIndex]) { info.leaderboards[type][statIndex].value = value; }
    else { info.leaderboards[type].push({ name: playerName, value }); }
    info.leaderboards[type].sort((a, b) => b.value - a.value);
    info.markModified('leaderboards');
    await info.save();
    res.redirect('/admin');
});

// --- DELETE ROUTES ---
app.post('/admin/delete-match', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    await Match.findByIdAndDelete(req.body.matchId);
    res.redirect('/admin');
});

app.post('/admin/delete-player', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    await Player.findByIdAndDelete(req.body.playerId);
    res.redirect('/admin');
});

app.post('/admin/delete-story', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    try {
        const { storyIndex } = req.body;
        const info = await getInfo();
        
        // Remove the story at the specific index position
        if (info.stories && info.stories[storyIndex] !== undefined) {
            info.stories.splice(storyIndex, 1);
            info.markModified('stories'); // Tells MongoDB the array changed
            await info.save();
        }
        
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.redirect('/admin?error=DeleteStoryFailed');
    }
});

app.post('/admin/delete-record', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    const info = await getInfo();
    info.records = info.records.filter(r => r.id != req.body.recordId);
    await info.save();
    res.redirect('/admin');
});

app.post('/admin/delete-stat', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    const { type, index } = req.body;
    const info = await getInfo();
    if (info.leaderboards[type]) {
        info.leaderboards[type].splice(index, 1);
        info.markModified('leaderboards');
        await info.save();
    }
    res.redirect('/admin');
});

app.post('/admin/delete-team', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    const { groupId, teamIndex } = req.body;
    const group = await Group.findById(groupId);
    if (group && group.teams[teamIndex]) {
        group.teams.splice(teamIndex, 1);
        await group.save();
    }
    res.redirect('/admin');
});

app.post('/admin/delete-group', async (req, res) => {
    if (!req.session.isAdmin) return res.redirect('/admin-login');
    await Group.findByIdAndDelete(req.body.groupId);
    res.redirect('/admin');
});

// --- ADMIN LOGIN ---
app.post('/admin-login', (req, res) => {
    if (req.body.password === ADMIN_KEY) {
        req.session.isAdmin = true;
        res.redirect('/admin');
    } else { res.render('admin-login', { error: "WRONG KEY!", page: 'admin' }); }
});

app.listen(process.env.PORT || 3000, () => console.log("VIM Hub Active"));
