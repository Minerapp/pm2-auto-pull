
process.env.MODULE_DEBUG = (process.NODE_ENV == 'production' ? false : true);

var pmx     = require('pmx');
var pm2     = require('pm2');
var async   = require('async');
var pkg     = require('./package.json');
var debug   = require('debug')(pkg.name);

//var conf    = pmx.initModule();

var conf = pmx.initModule({
  widget : {
    type             : 'generic',
    logo             : 'https://www.glcomp.com/media/catalog/category/Dell-R620_3_1_1.png',

    // 0 = main element
    // 1 = secondary
    // 2 = main border
    // 3 = secondary border
    theme            : ['#111111', '#1B2228', '#807C7C', '#807C7C'],

    el : {
      probes  : true,
      actions : true
    },

    block : {
      actions : false,
      issues  : true,
      meta : true,
      cpu: false,
      mem: false,
      main_probes : ['CPU usage', 'Free memory', 'Avail. Disk', 'Total Processes', 'TTY/SSH opened', 'eth0 input', 'eth0 output', 'Operating System']
    }

    // Status
    // Green / Yellow / Red
  }
}, function() {

  var cpu = require('./lib/cpu'),
      os = require('./lib/os'),
      drive = require('./lib/drive'),
      users = require('./lib/users'),
      shelljs = require('shelljs'),
      fs      = require('fs'),
      path    = require('path');

  if (process.platform == 'linux')
    var netstat = require('./lib/netstat'),
        mem = require('./lib/mem'),
        proc = require('./lib/proc');

  require('./lib/actions.js');
});
var Probe = pmx.probe();

var app_updated = Probe.counter({
  name : 'App updated'
});

function autoPull(cb) {
  pm2.list(function(err, procs) {

    async.forEachLimit(procs, 1, function(proc, next) {
      if (proc.pm2_env && proc.pm2_env.versioning) {
        debug('pull And Reload %s', proc.name);
        pm2.pullAndReload(proc.name, function(err, meta) {
          if (meta) {
            var rev = meta.rev;

            app_updated.inc();

            if (rev)
              console.log('Successfully pulled [App name: %s] [Commit id: %s] [Repo: %s] [Branch: %s]',
                          proc.name,
                          rev.current_revision,
                          meta.procs[0].pm2_env.versioning.repo_path,
                          meta.procs[0].pm2_env.versioning.branch);
            else {
              // Backward compatibility
              console.log('App %s succesfully pulled');
            }
          }
          if (err)
            debug('App %s already at latest version', proc.name);
          return next();
        });
      }
      else next();
    }, cb);

  });
}

pm2.connect(function() {
  console.log('pm2-auto-pull module connected to pm2');

  var running = false;

  setInterval(function() {
    if (running == true) return false;

    running = true;
    autoPull(function() {
      running = false;
    });
  }, 30000 || conf.interval);

});
