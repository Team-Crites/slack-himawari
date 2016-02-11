'use strict';
const fs = require("fs");
const http = require("http");
const connect = require("connect");
const app = connect();
const himawari = require("himawari");
const moment = require("moment");
const cloudinary = require("cloudinary");
const axios = require("axios");

app.use(require("body-parser").urlencoded({extended: true}));
app.use((req, res) => {
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["host"] || "localhost";
    const hostname = `${proto}://${host}`;

    if ("/" === req.url) {
        if (req.body.token !== process.env.SLACK_TOKEN) {
            res.writeHead(401);
            return res.end("invalid token");
        }

        let date = moment();
        if (req.body.text) {
             date = moment(req.body.text);
        }
        if (!date.isValid()) {
            res.writeHead(401);
            return res.end("invalid date, dingus");
        }

        const timestamp = +date;
        const filename = `himawari-${timestamp}.jpg`;
        const outfile = `/tmp/${filename}`;

        res.end();
        himawari({
            date: date.toDate(),
            outfile,
            success() {
                let stream = cloudinary.uploader.upload_stream(
                    () => {},
                    {public_id: filename, format: 'jpg'}
                );
                fs.createReadStream(outfile).pipe(stream).on('end', () => {
                    axios.post(req.body.response_url, {
                        text: "",
                        attachments: [{
                            fallback: "Couldn't show the earth :(",
                            image_url: `${hostname}/${filename}`,
                        }],
                    });
                });
            },
            error(err) {
                console.error(err.stack);
                res.writeHead(500);
                res.end('{"error":"server error"}');
            },
        });
    }
    else {
        const url = cloudinary.url(req.url.slice(1));
        if (url) {
            http.get(`${url}.jpg`, (img) => img.pipe(res));
        }
        else {
            res.setHeader("Content-Type", "application/json");
            res.writeHead(404);
            res.end('{"error":"not found"}');
        }
    }
});

const server = http.createServer(app);
server.listen(process.env.PORT || 3000);
