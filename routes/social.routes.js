const express = require('express');
const router = express.Router();
const controller = require('../controllers/social.controller.js');

router.get('/facebook', controller.authRedirect);
router.get('/facebook/callback', controller.callback);

module.exports = router;