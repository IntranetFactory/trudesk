/*
      .                             .o8                     oooo
   .o8                             "888                     `888
 .o888oo oooo d8b oooo  oooo   .oooo888   .ooooo.   .oooo.o  888  oooo
   888   `888""8P `888  `888  d88' `888  d88' `88b d88(  "8  888 .8P'
   888    888      888   888  888   888  888ooo888 `"Y88b.   888888.
   888 .  888      888   888  888   888  888    .o o.  )88b  888 `88b.
   "888" d888b     `V88V"V8P' `Y8bod88P" `Y8bod8P' 8""888P' o888o o888o
 ========================================================================
 Created:    11/29/2015
 Author:     Chris Brame

 **/

var async = require('async'),
    _ = require('underscore'),
    _s = require('underscore.string'),
    winston = require('winston'),
    permissions = require('../../../permissions'),
    emitter = require('../../../emitter'),

    userSchema = require('../../../models/user'),
    groupSchema = require('../../../models/group'),
    ticketSchema = require('../../../models/ticket');

var api_groups = {};

/**
 * @api {get} /api/v1/groups Get Groups
 * @apiName getGroups
 * @apiDescription Gets groups for the current logged in user
 * @apiVersion 0.1.0
 * @apiGroup Group
 * @apiHeader {string} accesstoken The access token for the logged in user
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/groups
 *
 * @apiSuccess {boolean}    success             Successful?
 * @apiSuccess {array}      groups              Array of returned Groups
 * @apiSuccess {object}     groups._id          The MongoDB ID
 * @apiSuccess {string}     groups.name         Group Name
 * @apiSuccess {array}      groups.sendMailTo   Array of Users to send Mail to
 * @apiSuccess {array}      groups.members      Array of Users that are members of this group
 *
 */
api_groups.get = function(req, res) {
    var user = req.user;

    groupSchema.getAllGroupsOfUser(user._id, function(err, groups) {
        if (err) return res.status(400).json({success: false, error: err.message});

        return res.json({success: true, groups: groups});
    });
};

/**
 * @api {post} /api/v1/groups/create Create Group
 * @apiName createGroup
 * @apiDescription Creates a group with the given post data.
 * @apiVersion 0.1.0
 * @apiGroup Group
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiParamExample {json} Request-Example:
 * {
 *      "name": "Group Name",
 *      "members": [members],
 *      "sendMailTo": [sendMailTo]
 * }
 *
 * @apiExample Example usage:
 * curl -X POST
 *      -H "Content-Type: application/json"
 *      -H "accesstoken: {accesstoken}"
 *      -d "{\"name\": \"Group Name\", \"members\": [members], \"sendMailTo\": [sendMailTo] }"
 *      -l http://localhost/api/v1/groups/create
 *
 * @apiSuccess {boolean} success If the Request was a success
 * @apiSuccess {object} error Error, if occurred
 * @apiSuccess {object} group Saved Group Object
 *
 * @apiError InvalidPostData The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Post Data"
 }
 */
api_groups.create = function(req, res) {
    var Group = new groupSchema();

    Group.name = req.body.name;
    Group.members = req.body.members;
    Group.sendMailTo = req.body.sendMailTo;

    Group.save(function(err, group) {
        if (err) return res.status(400).json({success: false, error: 'Error: ' + err.message});

        res.json({success: true, error: null, group: group});
    });
};

/**
 * Updates a group object. <br> <br>
 * Route: **[put] /api/groups/:id**
 *
 * @todo revamp to support access token
 * @param {object} req Express Request
 * @param {object} res Express Response
 * @return {Group} Updated Group Object
 * @example
 * group.name = data.name;
 * group.members = data.members;
 * group.sendMailTo = data.sendMailTo;
 */
api_groups.updateGroup = function(req, res) {
    var data = req.body;
    if (_.isUndefined(data) || !_.isObject(data)) return res.status(400).send('Error: Malformated Data.');

    groupSchema.getGroupById(data.id, function(err, group) {
        if (err) return res.status(400).send('Error: ' + err.message);

        if (_.isUndefined(group.members)) group.members = [];
        if (_.isUndefined(group.sendMailTo)) group.sendMailTo = [];

        if (!_.isArray(data.members) && data.members !== null && !_.isUndefined(data.members)) data.members = [data.members];
        if (!_.isArray(data.sendMailTo) && data.sendMailTo !== null && !_.isUndefined(data.sendMailTo)) data.sendMailTo = [data.sendMailTo];

        group.name = data.name;
        group.members = data.members;
        group.sendMailTo = data.sendMailTo;

        group.save(function(err, g) {
            if (err) return res.status(400).json({success: false, error: 'Error: ' + err.message});

            res.json(g);
        });
    });
};

/**
 * Deletes a group object. <br> <br>
 * Route: **[delete] /api/groups/:id**
 *
 * @todo revamp to support access token
 * @param {object} req Express Request
 * @param {object} res Express Response
 * @return {JSON} Success/Error Json Object
 */
api_groups.deleteGroup = function(req, res) {
    var id = req.params.id;
    if (_.isUndefined(id)) return res.status(400).json({success: false, error:'Error: Invalid Group Id.'});
    var returnData = {
        success: true
    };

    async.series([
        function(next) {
            var grps = [id];
            ticketSchema.getTickets(grps, function(err, tickets) {
                if (err) {
                    return next('Error: ' + err.message);
                }

                if (_.size(tickets) > 0) {
                    return next('Error: Cannot delete a group with tickets.');
                }

                next();
            });
        },
        function(next) {
            groupSchema.getGroupById(id, function(err, group) {
                if (err) return next('Error: ' + err.message);

                group.remove(function(err, success) {
                    if (err) return next('Error: ' + err.message);

                    winston.warn('Group Deleted: ' + group._id);
                    next(null, success);
                });
            });
        }
    ], function(err, done) {
        if (err) {
            returnData.success = false;
            returnData.error = err;

            return res.json(returnData);
        }

        returnData.success = true;
        return res.json(returnData);
    });
};

module.exports = api_groups;