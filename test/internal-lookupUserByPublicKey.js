var chai = require('chai');
chai.use(require('chai-http'));
var expect = chai.expect;
var _ = require('underscore');
var request = require('request');
var common = require('./common');
var deployerMock = require('./mock/deployer');

before(common.startServer);
var base = 'https://:' + common.defaultUser.apiKey + '@localhost:5000';

describe('internal lookupUserByPublicKey', function(){
  beforeEach(common.cleanDB);
  beforeEach(common.addUser);
  beforeEach(common.addSuperUser);

  it('should reject the request without key', function(done){
    deployerMock.lookupUserByPublicKey(common.defaultKey.fingerprint, function(err, res, body){
      if(err) return done(err);
      expect(res).to.have.status(404);
      body = JSON.parse(body);
      expect(body.error).to.exist;
      done();
    });
  });

  describe('with a valid key', function(){
    beforeEach(function(done){
      request.post({
        url: base + '/user/keys',
        body: common.defaultKey.sshKey,
        json: false
      }, done);
    });

    it('should reject the request with a normal user', function(done){
      request({
        url: base + '/internal/lookupUserByPublicKey?fingerprint=' + common.defaultKey.fingerprint,
        json: true
      }, function(err, res, body){
        expect(res).to.have.status(401);
        expect(body.error).to.equal('Access denied');
        done();
      });
    });

    it('should accept the request when giving a valid fingerprint', function(done){
      deployerMock.lookupUserByPublicKey(common.defaultKey.fingerprint, function(err, res, body){
        if(err) return done(err);
        expect(res).to.have.status(200);
        expect(body).include(':28790f7a7e2a33a7d12b0d5206cbc36020a36649');
        done();
      });
    });

    it('should reject the request when giving a bad fingerprint', function(done){
      deployerMock.lookupUserByPublicKey('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', function(err, res, body){
        if(err) return done(err);
        expect(res).to.have.status(404);
        body = JSON.parse(body);
        expect(body.error).to.exist;
        done();
      });
    });
  });
});
