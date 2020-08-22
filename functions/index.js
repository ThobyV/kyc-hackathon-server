const functions = require('firebase-functions');
const admin = require('firebase-admin');

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
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

function sendCustomVerificationEmail(email, displayName, link) {
    var smtpConfig = {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, // use SSL
        auth: {
            user: 'from@email.com',
            pass: 'password'
        }
    };
    var transporter = nodemailer.createTransport(smtpConfig);
    var mailOptions = {
        from: "YourApp@email.com", 
        to: email, 
        subject: "Email verification", // Subject line
        text: "Email verification, press here to verify your email: " + link,
        html: "<b>Hello there <br> click <a href=" + link + "> here to verify</a></b>" // html body
    };
    transporter.sendMail(mailOptions, function (error, response) {
        if (error) {
            console.log(error);
        } else {
            console.log("Message sent: " + response.message);
        }
        smtpTransport.close(); 
    });
}

exports.createUser = functions.auth.user().onCreate(async (user) => {
    try {
        const { displayName, uid, email } = user;
        console.log(email);
        let link = await admin.auth().generateEmailVerificationLink(email)
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

        let userDoc = await db.collection('users').doc(userRecord.uid).set({
            firstName,
            lastName,
            userName,
            email,
            hashedPassword,
        });
        return res.status(200).send(userDoc);
    } catch (error) {
        console.log(error)
        res.status(500).json({ error });
    }
});


app.post('/signin', async (req, res) => {
    try {
        let { email, password } = req.body;
        let userDoc = await db.collection('users')
            .where('email', '==', email)
            .get();
        if (userAccount.empty) throw 'account does not exist';
        let { _email, _password, _uid } = userAccount.docs[0].data();
        let passwordMatch = bcrypt.compareSync(password, _password);
        if (!passwordMatch) throw 'passwords do not match';
        let customToken = await auth.createCustomToken(_uid)

        return res.status(200).send(customToken);
    } catch (error) {
        console.log(error)

        res.status(500).json({ error });
    }
});