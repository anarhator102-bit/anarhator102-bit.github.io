const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
UPLOADS
========================= */

if(!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

app.use('/uploads', express.static('uploads'));

/* =========================
TRACKS DB
========================= */

const tracksFile = 'tracks.json';

let tracks = [];

if(fs.existsSync(tracksFile)){

    tracks = JSON.parse(
        fs.readFileSync(tracksFile)
    );

}

/* =========================
SAVE TRACKS
========================= */

function saveTracks(){

    fs.writeFileSync(
        tracksFile,
        JSON.stringify(tracks,null,2)
    );

}

/* =========================
MULTER
========================= */

const storage = multer.diskStorage({

    destination:(req,file,cb)=>{

        cb(null,'uploads');

    },

    filename:(req,file,cb)=>{

        const unique =
        Date.now() +
        '-' +
        Math.round(Math.random()*1e9);

        cb(
            null,
            unique +
            path.extname(file.originalname)
        );

    }

});

const upload = multer({ storage });

/* =========================
UPLOAD LIMIT
1 TRACK / 3 MINUTES
========================= */

const uploadsCooldown = {};

/* =========================
GET TRACKS
========================= */

app.get('/tracks',(req,res)=>{

    res.json(tracks);

});

/* =========================
UPLOAD TRACK
========================= */

app.post(
'/upload',

upload.fields([
    { name:'cover', maxCount:1 },
    { name:'audio', maxCount:1 }
]),

(req,res)=>{

    try{

        const ip =
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress;

        const now = Date.now();

        const cooldown =
        3 * 60 * 1000;

        if(uploadsCooldown[ip]){

            const diff =
            now - uploadsCooldown[ip];

            if(diff < cooldown){

                const left =
                Math.ceil(
                    (cooldown - diff)/1000
                );

                return res.status(429).json({

                    error:
                    `wait ${left} sec before next upload`

                });

            }

        }

        uploadsCooldown[ip] = now;

        if(
            !req.files.cover ||
            !req.files.audio
        ){

            return res.status(400).json({
                error:'files missing'
            });

        }

        const cover =
        '/uploads/' +
        req.files.cover[0].filename;

        const audio =
        '/uploads/' +
        req.files.audio[0].filename;

        const track = {

            id:Date.now(),

            title:req.body.title || 'unknown',

            artist:req.body.artist || 'unknown',

            cover,

            audio,

            plays:0,

            likes:0,

            createdAt:Date.now()

        };

        tracks.unshift(track);

        saveTracks();

        res.json(track);

    }catch(err){

        console.log(err);

        res.status(500).json({
            error:'upload failed'
        });

    }

});

/* =========================
COUNT PLAY
========================= */

app.post('/play/:id',(req,res)=>{

    const id = Number(req.params.id);

    const track =
    tracks.find(t => t.id === id);

    if(!track){

        return res.status(404).json({
            error:'track not found'
        });

    }

    track.plays += 1;

    saveTracks();

    res.json({

        success:true,

        plays:track.plays

    });

});

/* =========================
LIKE TRACK
========================= */

app.post('/like/:id',(req,res)=>{

    const id = Number(req.params.id);

    const track =
    tracks.find(t => t.id === id);

    if(!track){

        return res.status(404).json({
            error:'track not found'
        });

    }

    track.likes += 1;

    saveTracks();

    res.json({

        success:true,

        likes:track.likes

    });

});

/* =========================
START
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{

    console.log(
        'SERVER STARTED ON PORT ' + PORT
    );

});
