'use strict';
var express = require('express');
var config = require('./config');
var path = require('path');
var requireTree = require('require-tree');
var middlewares = requireTree('./middlewares');
var connectTimeout = require('connect-timeout');
var monitor = require('./helpers/monitor');
var JTCluster = require('jtcluster');


/**
 * [initAppSetting 初始化app的配置信息]
 * @param  {[type]} app [description]
 * @return {[type]}     [description]
 */
var initAppSetting = function(app){
  app.set('view engine', 'jade');
  app.set('trust proxy', true);
  app.set('views', path.join(__dirname, 'views'));
  app.locals.pretty = config.env === 'development';
  app.locals.ENV = config.env;
  app.locals.STATIC_URL_PREFIX = config.staticUrlPrefix;
};


var initServer = function(){
  //性能监控的间隔时间
  var monitorInterval = 10 * 1000;
  if(config.env === 'development'){
    monitorInterval = 60 * 1000;
  }
  monitor.start(monitorInterval);

  var app = express();
  initAppSetting(app);

  // http请求5秒超时
  app.use(connectTimeout(5 * 1000));

  //用于varnish haproxy检测node server是否可用
  app.use('/ping', function(req, res){
    res.send('OK');
  });

  // http log
  var httpLoggerType = 'tiny';
  if(config.env === 'development'){
    httpLoggerType = 'dev';
  }
  app.use(middlewares.http_log(httpLoggerType));

  // 添加一些信息到response header中
  app.use(middlewares.jtinfo(config.process));

  //单位秒
  var staticMaxAge = 365 * 24 * 3600;
  var staticPath = config.staticPath;
  var staticUrlPrefix = config.staticUrlPrefix;
  if(config.env === 'development'){
    var jtDev = require('kndev');
    app.use(staticUrlPrefix, middlewares.static_dev(path.join(staticPath, 'src')));
    staticMaxAge = 0;
    app.use(staticUrlPrefix, middlewares.static(path.join(staticPath, 'src'), staticMaxAge));

  }else{
    app.use(staticUrlPrefix + '/src', middlewares.static(path.join(staticPath, 'src'), 0));
    app.use(staticUrlPrefix, middlewares.static(path.join(staticPath, 'dest'), staticMaxAge));
  }
  


  app.use(require('method-override')());

  var bodyParser = require('body-parser');
  app.use(bodyParser.json());


  // admin的router
  app.use('/jt', middlewares.admin('6a3f4389a53c889b623e67f385f28ab8e84e5029'));

  // debug参数的处理，有_debug和_pattern等
  app.use(middlewares.debug());
  

  app.use(function(req, res, next){
    res.set('Cache-Control', 'no-cahce');
    next();
  });

  app.use(require('./router'));

  app.listen(config.port);
  console.log('server listen on:' + config.port);
};

if(config.env === 'development'){
  initServer();
}else{
  new JTCluster({
    handler : initServer,
    envs : [
      {
        jtProcessName : 'tiger'
      },
      {
        jtProcessName : 'cuttlefish'
      }
    ],
    error : console.error,
    log : console.log
  });
}
