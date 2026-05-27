
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

if(!fs.existsSync('uploads')){
    fs.mkdirSync('uploads');
}

if(!fs.existsSync('tracks.json')){
    fs.writeFileSync('tracks.json','[]');
}

const storage = multer.diskStorage({
    destination:(req,file,cb)=>{
        cb(null,'uploads/');
    },
    filename:(req,file,cb)=>{
        cb(null,Date.now() + '-' + file.originalname);
    }
});

const upload = multer({storage});

const uploadCooldowns = {};
const UPLOAD_COOLDOWN = 3 * 60 * 1000;

app.get('/tracks',(req,res)=>{
    const ip =
    req.headers['x-forwarded-for'] ||
    req.socket.remoteAddress ||
    'unknown';

    const lastUpload = uploadCooldowns[ip];

    if(lastUpload &&
    Date.now() - lastUpload < UPLOAD_COOLDOWN){

        return res.status(429).json({
            error:'Подожди 3 минуты перед загрузкой'
        });

    }

    const tracks = JSON.parse(fs.readFileSync('tracks.json'));
    res.json(tracks);
});


app.post('/track/:id/play',(req,res)=>{

    const tracks = JSON.parse(fs.readFileSync('tracks.json'));

    const trackIndex =
    tracks.findIndex(t => t.id == req.params.id);

    if(trackIndex === -1){

        return res.status(404).json({
            error:'Track not found'
        });

    }

    tracks[trackIndex].plays += 1;

    fs.writeFileSync(
        'tracks.json',
        JSON.stringify(tracks,null,2)
    );

    res.json({
        success:true,
        plays:tracks[trackIndex].plays
    });

});

app.post('/track/:id/like',(req,res)=>{

    const tracks = JSON.parse(fs.readFileSync('tracks.json'));

    const trackIndex =
    tracks.findIndex(t => t.id == req.params.id);

    if(trackIndex === -1){

        return res.status(404).json({
            error:'Track not found'
        });

    }

    tracks[trackIndex].likes += 1;

    fs.writeFileSync(
        'tracks.json',
        JSON.stringify(tracks,null,2)
    );

    res.json({
        success:true,
        likes:tracks[trackIndex].likes
    });

});


app.post('/upload', upload.fields([
    {name:'cover',maxCount:1},
    {name:'audio',maxCount:1}
]), (req,res)=>{

    const tracks = JSON.parse(fs.readFileSync('tracks.json'));

    const track = {
        id:Date.now(),
        title:req.body.title,
        artist:req.body.artist,
        cover:'/uploads/' + req.files.cover[0].filename,
        audio:'/uploads/' + req.files.audio[0].filename,
        plays:0,
        likes:0
    };

    tracks.unshift(track);

    fs.writeFileSync('tracks.json', JSON.stringify(tracks,null,2));

    uploadCooldowns[ip] = Date.now();

    res.json(track);
});

app.listen(PORT,()=>{
    console.log('Server started on port ' + PORT);
});
