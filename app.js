const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios');
const lqip = require('lqip');
const cron = require('node-cron');
const helmet = require('helmet');
const Mixpanel = require('mixpanel');
const fs = require('fs');
const { Client, Intents } = require('discord.js');

dotenv.config();

const indexRouter = require('./routes/index');
const usersRouter = require('./routes/users');

const app = express();
global.cache = {
    instagram: null
};
global.discord = new Client({ intents: [Intents.FLAGS.GUILDS] });

(async function () {
    try {
        let raw = fs.readFileSync('cache-instagram.json');
        let feed = [];

        raw = JSON.parse(raw);

        raw.medias.forEach((media) => {
            try {
                let file = '/var/www/db/public/uploads/' + media.node.shortcode + '.png';

                axios({
                    method: 'GET',
                    url: media.node.display_url,
                    responseType: 'stream',
                }).then((response) => {
                    const w = response.data.pipe(fs.createWriteStream(file));
                    w.on('finish', () => {
                        console.log('DOWNLOADED', media.node.shortcode);
                        lqip.base64(file).then(encoded => {
                            const buffer = Buffer.from(encoded.replace(/^data:image\/png;base64,/, ''), 'base64');
                            fs.writeFile('/var/www/db/public/uploads/' + media.node.shortcode + '.lqip.png', buffer, function (err) {
                                if (err) {
                                    console.log('LQIP ERROR', err);
                                }
                            });
                        });
                    });
                });
            } catch (err) {
                throw new Error(err);
            }

            feed.push({
                id: media.node.shortcode,
                alt: media.node.accessibility_caption,
                likes: media.node.edge_liked_by.count,
                comments: media.node.edge_media_to_comment.count,
            });
        });

        cache.instagram = feed;
        console.log('INSTAGRAM CACHE LOADED');
    } catch (err) {
        console.error('NO INSTAGRAM CACHE FOUND', err);
    }
}());

// https://discordjs.guide/creating-your-bot/command-handling.html#individual-command-files
discord.login(process.env.DISCORD_TOKEN);
discord.once('ready', () => {
    console.log('DISCORD READY');

    setRandomStatus();
    cron.schedule('*/5 * * * *', () => {
        setRandomStatus()
    });
});

const setRandomStatus = function(){
    const activity = ['PLAYING', 'COMPETING', 'WATCHING'][Math.floor(Math.random() * 3)];
    const modes = {
        'PLAYING' : [
            'Speedrounds',
            'Titanball',
            'Flux',
            'Freeze Tag',
            'Humans vs Zombies',
            'Pistol Rounds',
            'Shatter Battle'
        ],
        'COMPETING' : [
            'Quickflag',
            'Ion Rush',
            'King of the Hill'
        ],
        'WATCHING' : [
            'Brandon Diaz',
            'Beret',
            'Alpha',
            'Captain Xavier',
            'Coop772',
            'Bradley Phillips',
            'Dr. Flux',
            'WalcomS7',
            'Jangular',
            'Out of Darts',
            'Valour',
            'FoamBlast',
            'Spyder',
            'Knightwing'
        ]
    };

    const games = modes[activity];
    let game = games[games.length * Math.random() | 0];

    if (activity == 'WATCHING') {
        if (game.endsWith('s')) {
            game += '\' Latest Video'
        } else {
            game += '\'s Latest Video'
        }
    }

    discord.user.setActivity(game, {type: activity});
};

const rawBodySaver = function (req, res, buf, encoding) {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
}

app.use(cors());
app.use(helmet());
app.use(logger('dev'));
// app.use(express.json());
app.use(bodyParser.json({ verify: rawBodySaver }));
app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: true }));
app.use(bodyParser.raw({ verify: rawBodySaver, type: '*/*' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);

module.exports = app;
