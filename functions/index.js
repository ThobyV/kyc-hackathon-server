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
            user: 'vivee18@gmail.com',
            pass: 'qufgalxwfthwzdzh',
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
        else { console.log("Message sent: " + response.message); }
    });
}

exports.createUser = functions.auth.user().onCreate(async (user) => {
    try {
        const { displayName, uid, email } = user;
        let link = await admin.auth().generateEmailVerificationLink(email)
        console.log(link);
        return await sendCustomVerificationEmail(email, displayName, link);
    } catch (error) {
        console.log(error);
    }
})

app.post('/signup', async (req, res) => {
    try {
        console.log('function signup')
        const {
            firstName,
            lastName,
            userName,
            email,
            password,
        } = req.body;

        let hashedPassword = bcrypt.hashSync(password, 8);

        let userRecord = await auth.createUser({
            email: email,
            emailVerified: false,
            password: hashedPassword,
            displayName: `${firstName} ${lastName} `,
        })

        let token = await auth.createCustomToken(userRecord.uid);

        let userDoc = await db.collection('users').doc(userRecord.uid).set({
            firstName,
            lastName,
            userName,
            email,
            hashedPassword,
        });
        return res.status(200).send({ token, userRecord });
    } catch (error) {
        console.log(error)
        res.status(500).json({ error });
    }
});


app.post('/signin', async (req, res) => {
    try {
        let { email, password } = req.body;

        let userAccount = await db.collection('users').where('email', '==', email).get();
        if (userAccount.empty) { throw 'account does not exist'; }
        let { _email, _password } = userAccount.docs[0].data();
        let passwordMatch = bcrypt.compareSync(password, _password);
        if (!passwordMatch) throw 'passwords do not match';
        let token = await auth.createCustomToken(userAccount.id);
        return res.status(200).send({ token, userAccount });
    } catch (error) {
        console.log(error)
        res.status(500).json({ error });
    }
});

app.post('/verifybvn', async (req, res) => {
    try {
        let bvnData = {
            bvnId: '23553332',
            dateOfBirth: '4/07/1995',
            phoneNumber: '09023685797'
        }

        let { bankVerificationId, dateOfBirth } = req.body;

        if (bankVerificationId === bvnData.bnvId && dateOfBirth === bvnData.dateOfBirth) {
            console.log('congrats bvn matches')
            //send otp
            // update bvn data
            let verifiedData = { verfied: true, bankVerificationId, dateOfBirth };
            res.status(200).send(verifiedData);
        } else {
            throw 'your bnv does not match'
        }

        return res.status(200).send(customToken);
    } catch (error) {
        console.log(error)

        res.status(500).json({ error });
    }
});