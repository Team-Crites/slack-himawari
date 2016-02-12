'use strict';
const fs = require("mz/fs");
const http = require("http");
const co = require("co");
const connect = require("connect");
const app = connect();
const himawari = require("himawari");
const moment = require("moment");
const axios = require("axios");

app.use(require("body-parser").urlencoded({extended: true}));
app.use((req, res) => co(function* () {
    // Determine host that Slack can access
    const proto = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers["host"] || "localhost";
    const hostname = `${proto}://${host}`;

    // Root command is the himawari command -- generate the image
    if ("/" === req.url) {
        if (req.body.token !== process.env.SLACK_TOKEN) {
            let error = new Error("invalid token");
            error.status = 401;
            throw error;
        }

        let date = moment();
        if (req.body.text) {
             date = moment(req.body.text);
        }
        if (!date.isValid()) {
            let error = new Error("invalid date, dingus");
            error.status = 400;
            throw error;
        }

        const timestamp = +date;
        const filename = `himawari-${timestamp}.jpg`;
        const outfile = `/tmp/${filename}`;

        // Image generation takes some time; we'll use the Slack callback URL
        res.end();

        const dfd = Promise.defer();
        himawari({
            date: date.toDate(),
            outfile,
            // TODO https://github.com/jakiestfu/himawari.js/pull/7
            success() {
                dfd.resolve();
            },
            error() {
                dfd.reject();
            },
        });
        yield dfd.promise;
        // Respond with a path to the image
        yield axios.post(req.body.response_url, {
            text: "",
            attachments: [{
                fallback: "Couldn't show the earth :(",
                image_url: `${hostname}/${filename}`,
            }],
        });
    }
    else {
        // An image has been requested. Emit it and then delete it.
        const file = `/tmp${req.url}`;
        if (yield fs.exists(file)) {
            const stream = fs.createReadStream(file);
            stream.pipe(res);
            res.on("end", () => fs.unlink(file));
        }
        else {
            let error = new Error("not found");
            error.status = 404;
            throw error;
        }
    }
}).catch(err => {
    // Handle all errors thrown
    console.error(err.stack);
    res.writeHead(err.status || 500);
    res.end(err.message);
}));

const server = http.createServer(app);
server.listen(process.env.PORT || 3000, () => console.log("Why was I programmed to feel pain??"));
