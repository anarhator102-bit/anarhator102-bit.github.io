
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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

app.get('/tracks',(req,res)=>{
    const tracks = JSON.parse(fs.readFileSync('tracks.json'));
    res.json(tracks);
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

    res.json(track);
});

app.listen(PORT,()=>{
    console.log('Server started on port ' + PORT);
});
