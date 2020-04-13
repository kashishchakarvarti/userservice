const express = require("express");
const bodyparser = require("body-parser");
const fs = require('fs');
const merge = require('lodash/merge');
const get = require('lodash/get');
const app = express();
const jwt = require('njwt');
const axios = require('axios');
const parser = require('xml2json');
const newsUrl = require('./constant/urlConstants');
const Joi = require('joi')
const validator = require('express-joi-validation').createValidator({})
require('dotenv').config()

const bodySchema = Joi.object({
  username: Joi.string().min(2).required(),
  password: Joi.string().min(4).regex(/(?=.*\d)(?=.*[A-Z]).*/).required()

})

const headerSchema = Joi.object({
  token: Joi.string().required()
});


const cred = './cred.json'
const port = process.env.PORT || 12346;
app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());


app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Credentials', true);
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept,token');
  if ('OPTIONS' === req.method) {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.get("/", (req, res) => {
  res.status(200).send(response(true, ` backend working`));
});
//  joi validation can be implememted for username and password regex
app.post("/signup", validator.body(bodySchema), (req, res) => {
  try {
    const { username, password } = req.body;

    const user = getUser(username);
    if (user) {
      return res.status(400).send(response(false, 'user already exist'));

    }
    savePayload({ [username]: { username, password } });
    return res.status(200).send(response(true, 'user saved'));

  } catch ({ message }) {
    console.error(message);
    res.status(500).send(response(false, message));
  }
})

app.post("/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!(username && password)) {
      return res.status(400).send(response(false, 'username or password missing'));
    }
    const user = getUser(username)
    if (!(user && user.password === password)) {
      return res.status(400).send(response(false, 'username or password is incorrect'));

    }
    user.login = true;
    savePayload({ [username]: { ...user } })
    return res.status(200).send(response(true, 'succesfully login', { token: generateToken(req.body) }));
  } catch ({ message }) {
    console.error(message);
    res.status(500).send(response(false, message));
  }
})

app.get("/dashboard", validator.headers(headerSchema), async (req, res) => {
  try {
    if (!validateRequest(req)) {
      return res.status(400).send(response(false, 'no auth'));
    }
    let arr = [];
    for (let i in newsUrl.url) {
      arr.push(axios.get(newsUrl.url[i]))
    }
    const news = await fetchNews(arr);
    res.status(200).send(response(true, 'news data', { news }));
  } catch ({ message }) {
    console.error(message)
    res.status(500).send(response(false, message));
  }
})

app.post("/logout", (req, res) => {
  try {
    const user = validateRequest(req)
    if (user) {
      user.login = false;
      savePayload({ [user.username]: user });
      return res.status(200).send(response(true, 'succesfully logout'))
    }
    return res.status(400).send(response(false, 'unable to logout '));
  } catch ({ message }) {
    console.error(message);
    res.status(500).send(response(false, message));
  }
})

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});





/// private functions 
const savePayload = (jsonPayload) => {
  try {
    const res = { success: true, message: 'saved successfully' }
    const rawData = fs.readFileSync(cred);
    if (rawData.toString().length) {
      data = JSON.parse(rawData);
      if (data[Object.keys(jsonPayload)[0]]) {
        delete data[Object.keys(jsonPayload)[0]];
      }
      jsonPayload = merge(data, jsonPayload);
    }
    fs.writeFileSync(cred, JSON.stringify(jsonPayload));
    return res;
  } catch (err) {
    throw err;
  }
}
const getUser = (username) => {
  try {
    const rawData = fs.readFileSync(cred);
    if (rawData.toString().length) {
      data = JSON.parse(rawData);
      if (data[username]) {
        return data[username];
      }
    }
    return false;
  } catch (err) {
    throw err;
  }
}

const validateRequest = (req) => {
  try {
    const { token } = req.headers;
    const decryptedToken = decryptToken(token);
    const body = get(decryptedToken, 'body', {});
    if (body && body.username) {
      const user = getUser(body.username);
      if (user && user.login) {
        return user;
      };
    };
    return false;
  } catch (err) {
    throw err;
  }
};

const generateToken = (payload) => {
  try {
    const token = jwt.create(payload, process.env.JWT_SECRET)
    token.setExpiration(new Date().getTime() + 60 * 100000)
    return token.compact();
  } catch (err) {
    throw err;
  }
}
const decryptToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw err;
  }
}

const fetchNews = async (promiseArray) => {
  try {
    return Promise.all(promiseArray).then((responseArray) => {
      return responseArray.map((responseObj) => {
        const parsedJson = parser.toJson(responseObj.data);
        const newsArray = get(JSON.parse(parsedJson), 'rss.channel.item', [])
        return newsArray.filter((news, i) => i < 5)
      })
    }).catch(error => {
      console.log(error)
    });
  } catch (err) {
    throw err;
  }
}

const response = (success, message, data) => {
  return {
    success,
    message,
    data
  }
}