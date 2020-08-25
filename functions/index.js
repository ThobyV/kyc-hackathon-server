const functions = require('firebase-functions');
const admin = require('firebase-admin');

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const serviceAccount = require('./service-account');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kyc-app-65a63.firebaseio.com"
});

const db = admin.firestore();
const auth = admin.auth();

const app = express();
const main = express();

main.use(cors({ origin: true }));
main.use(app);
main.use(bodyParser.json());

exports.kycAPI = functions.https.onRequest(main);

const sendCustomVerificationEmail = (email, displayName, link) => {
    var config = {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        }
    };
    var mailOptions = {
        from: "kyc-client@mail.com",
        to: email,
        subject: "Email verification",
        text: "Email verification, press here to verify your email: " + link,
        html: "<b>Hello there <br> click <a href=" + link + "> here to verify</a></b>" // html body
    };
    var transporter = nodemailer.createTransport(config);
    transporter.sendMail(mailOptions, (error, response) => {
        if (error) { console.log(error); }
        else { console.log("Message sent"); }
    });
}

const checkToken = async (req, res, next) => {
    const token = req.headers.authorization;
    console.log(token);
    if (!token) return res.status(401).send({ error: 'token not found' });
    try {
        let userRecord = await auth.verifyIdToken(token);
        req.isSuperAdmin = userRecord.isSuperAdmin;
        next();
    } catch (error) {
        console.log(error);
        return res.status(403).send(error);
    }
}

const checkAdmin = (req, res, next) => {
    //role codes are a secret key: 
    //34yvuc is the custom code for admin term: global admin
    if (req.isSuperAdmin) {
        next();
    }
}

exports.createUser = functions.auth.user().onCreate(async (user) => {
    try {
        const { displayName, uid, email } = user;
        let link = await admin.auth().generateEmailVerificationLink(email)
        console.log(link);
        return await sendCustomVerificationEmail(email, displayName, link);
    } catch (error) {
        console.log(error);
        return
    }
})

app.post('/signup', async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            userName,
            email,
            password,
        } = req.body;

        let hashedPassword = await bcrypt.hash(password, 8);

        let { uid } = await auth.createUser({
            email: email,
            emailVerified: false,
            password: hashedPassword,
            displayName: `${firstName} ${lastName} `,
        })

        let userDoc = await db.collection('users').doc(uid).set({
            firstName,
            lastName,
            userName,
            email,
            hashedPassword,
        });

        if (email === "cpuinformers@gmail.com") {
            await admin.auth().setCustomUserClaims(uid, { isSuperAdmin: true })
        }
        let token = await auth.createCustomToken(uid);
        return res.status(200).send(token);
    } catch (error) {
        console.log(error)
        res.status(500).send(error);
    }
});


app.post('/signin', async (req, res) => {
    try {
        //we use user doc here instead of admin getUserByEmail to save us stress of accessing 
        //firebase based passwords from here
        let userDoc = await db.collection('users').where('email', '==', req.body.email).get();
        if (userDoc.empty) { throw 'account does not exist'; }
        let { hashedPassword } = userDoc.docs[0].data();
        let passwordMatch = await bcrypt.compare(req.body.password, `${hashedPassword}`);
        if (!passwordMatch) throw 'passwords do not match';
        let token = await auth.createCustomToken(userDoc.docs[0].id);
        return res.status(200).send(token);
    } catch (error) {
        console.log(error)
        return res.status(500).send(error);
    }
});

app.get('/profile/:uid', checkToken, async (req, res) => {
    try {
        let userDoc = await db.collection('users').doc(req.params.uid).get();
        if (!userDoc.exists) { throw 'account does not exist'; }
        let { firstName, lastName, userName, BVN, passport } = userDoc.data()
        return res.status(200).send({ firstName, lastName, userName, BVN, passport });
    } catch (error) {
        console.log(error)
        return res.status(500).send(error);
    }
});

app.post('/verifybvn', checkToken, checkAdmin, async (req, res) => {
    try {
        let bvnData = {
            bvnId: '235',
            dateOfBirth: '04/07/1995',
            phoneNumber: '+2349023685797'
        }

        let { bankVerificationId, dateOfBirth } = req.body;

        if ((bankVerificationId === bvnData.bvnId) && (dateOfBirth === bvnData.dateOfBirth)) {
            let verifiedData = {
                valid: true, phoneNumber: bvnData.phoneNumber, dob: bvnData.dateOfBirth
            };
            return res.status(200).send(verifiedData);
        } else {
            console.log(req.body.bvnData);
            throw 'your bvn has data does not match'
        }
    } catch (error) {
        console.log(error)
        return res.status(500).send(error);
    }
});


app.post('/updatebvn', checkToken, checkAdmin, async (req, res) => {
    try {
        const { uid, bvnData } = req.body;

        await db.collection('users').doc(uid).set({
            ...bvnData
        }, { merge: true });

        return res.status(200).send(bvnData);
    } catch (error) {
        console.log(error)
        return res.status(500).send(error);
    }
});
