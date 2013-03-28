var db = require('../apidb');
var dbfacade= require('../dbfacade')(db);
var async = require('async');
var conf = require('../conf');

module.exports = {

  deployApp: {
    routePath : '/apps/:appName/deploy',
    payloadSource: 'query',
    method: 'PUT',
    okayCode: 200,

    // Presence of 'handler' overrides attempt to call DB function with same name as route key
    handler: function(cb) {
      var self = this;

      // This is the command that is run on the build dyno. It's not strictly a git hook as it
      // does the aactual fetching itself. There doesn't seem to be any suitable hooks that can
      // actually deal with post-fetching. Well there's post-merge, but that has to be run manually
      // after a git fetch anyway.
      this.requestPayload.command = '/app/hooks/fetch-repo ' + this.requestPayload.app.github_url;
      this.requestPayload.commandArgs = null;

      // Change the API key from the deployer's to that of Super User as the job needs to make
      // internal API requests with it.
      this.requestPayload.apiKey = conf.apiserver.key;

      // Get a job to build the new slug
      dbfacade.exec('handleGitCommand', this.requestPayload, function(dbError, dbResult) {
        if(dbError) return cb(dbError);

        var timesQueried = 0;
        var jobId = dbResult.rows[0].id;
        var result;

        // Get connection details to the build dyno
        async.whilst(function() {
          return !(result || timesQueried > 15);
        }, function(callback) {
          dbfacade.exec('getJob', { jobId: jobId }, function(err, dbResult) {
            timesQueried++;
            if(err) return callback(err);

            var job = dbResult.rows[0];
            if(job.distributed_to) {
              // These details are then used by the CLI cient to open a real-time socket
              // to the dyno.
              result  = {
                slug: "000000_00000",
                command: self.requestPayload.command,
                upid: job.dyno_id,
                process: 'dyno.' + job.dyno_id,
                action: 'complete',
                rendezvous_url: 'tcp://' + conf.openruko.base_domain + ':4321/' + job.rez_id,
                type: 'Ps',
                elapsed: 0,
                attached: true,
                transitioned_at: new Date(),
                state: 'starting'
              };
              var rezMap = require('../rendezpass');
              rezMap.addMapping(job.rez_id, job.distributed_to, job.dyno_id);

            }
            if(result) {
              callback();
            } else {
              setTimeout(callback, 500);
            }
          });
        }, function(err) {
          if(err || !result) {
            console.log('Unable to assign job');
            return cb({ error: 'job not assigned' });
          }
          self.responsePayload = result;
          cb();
        });
      });

    }
  }
};