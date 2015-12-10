
process.env.MODULE_DEBUG = (process.NODE_ENV == 'production' ? false : true);

var fs      = require('fs');
var path    = require('path');
var pmx     = require('pmx');
var pm2     = require('pm2');
var async   = require('async');
var pkg     = require('./package.json');
var debug   = require('debug')(pkg.name);
var depDiff = require('dependency-diff');
var spawn   = require('child_process').spawn;

var conf    = pmx.initModule();
var Probe = pmx.probe();

var app_updated = Probe.counter({
  name : 'App updated'
});
function autoPull(cb) {
  pm2.list(function(err, procs) {

    async.forEachLimit(procs, 1, function(proc, next) {
      if (proc.pm2_env && proc.pm2_env.versioning) {
        debug('pull And Reload %s', proc.name);
	console.log('switching to', proc.pm2_env.pm_cwd)
        process.chdir(proc.pm2_env.pm_cwd)
        var before = JSON.parse(fs.readFileSync(path.join(proc.pm2_env.pm_cwd, 'package.json'), 'utf8'));
        pm2.pullAndReload(proc.name, function(err, meta) {
          if (meta) {
            var rev = meta.rev;
            var after = JSON.parse(fs.readFileSync(path.join(proc.pm2_env.pm_cwd, 'package.json'), 'utf8'));
            app_updated.inc();
            var cmdList = depDiff().left(before).right(after).toCmdList();
            console.log('executing', cmdList)
            if (proc.pm2_env.exec_interpreter !== 'node') {
              return;
            }
            pm2.stop(proc.name, function (err, meta) {
              async.map(cmdList, installDependencies, function(err, res) {
                console.log(err,res);
                pm2.restart(proc.name, function (err, meta) {
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
                })
              })
            })
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

function installDependencies(cmd, cb) {
  cmd = cmd.split(' ');
  cmd[2] = cmd[2].replace(/"/g, '');
  var child = spawn(cmd.splice(0,1)[0], cmd)
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  child.on('error', cb);
  child.on('close', function (code) {
    if (code === 0) {
      return cb(null, true);
    } else {
      return cb(new Error('child process exited with non-zero exit code'), code);
    }
  })
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
  }, 1000 || conf.interval);

});

