import Ember from 'ember';
import Socket from 'ui/utils/socket';
import Util from 'ui/utils/util';
import AuthenticatedRouteMixin from 'ui/mixins/authenticated-route';
import C from 'ui/utils/constants';

export default Ember.Route.extend(AuthenticatedRouteMixin, {
  socket: null,

  model: function(params, transition) {
    var store = this.get('store');
    var session = this.get('session');

    // Load schemas
    return store.find('schema', null, {url: 'schemas'}).then((/*schemas*/) => {
      var isAdmin = session.get(C.USER_TYPE_SESSION_KEY) === C.USER_TYPE_ADMIN;
      // Save whether the user is an admin or not.
      // For cattle >= v0.6 the token response will have userType: admin/user, for older look for a schema
      this.set('app.isAuthenticationAdmin', isAdmin || store.hasRecordFor('schema','githubconfig'));

      // Load all the projects
      var supportsProjects = this.get('app.authenticationEnabled') && store.hasRecordFor('schema','project');
      this.set('app.projectsEnabled', supportsProjects);

      if ( supportsProjects )
      {
        return store.find('project').catch(() => {
          this.set('app.projectsEnabled', false);
          return Ember.RSVP.resolve();
        });
      }
      else
      {
        return Ember.RSVP.resolve();
      }
    }).catch((err) => {
      if ( err.status === 401 )
      {
        this.send('logout',transition,true);
      }
      else
      {
        this.send('error',err);
      }
    });
  },

  setupController: function(controller /*, model*/) {
    this._super.apply(this,arguments);

    if ( this.get('app.projectsEnabled') )
    {
      var all = this.get('store').all('project');
      controller.set('projects', all);

      var projectId = this.get('session').get(C.PROJECT_SESSION_KEY);
      if ( projectId )
      {
        var project = all.filterBy('id', projectId)[0];
        if ( project )
        {
          controller.set('project', project);
        }
        else
        {
          this.get('session').set(C.PROJECT_SESSION_KEY, undefined);
          this.set('project', null);
        }
      }
      else
      {
        controller.set('project', null);
      }
    }
  },

  actions: {
    error: function(err,transition) {
      // Unauthorized error, send back to login screen
      if ( err.status === 401 )
      {
        this.send('logout',transition,true);
        return false;
      }
      else
      {
        // Bubble up
        return true;
      }
    },

    switchProject: function(projectId) {
      this.get('session').set(C.PROJECT_SESSION_KEY, projectId);
      this.get('store').reset();
      this.transitionTo('index');
    },

    setPageName: function(str) {
      this.controller.set('pageName',str);
    },

    setPageLayout: function(opt) {
      this.controller.set('pageName', opt.label || '');
      this.controller.set('backRoute', opt.backRoute || null);
      this.controller.set('backPrevious', opt.backPrevious || null);
      this.controller.set('addRoute', opt.addRoute || null);

      if ( typeof opt.hasAside === 'undefined' )
      {
        this.controller.set('hasAside', false);
        this.controller.set('asideColor', '');
      }
      else
      {
        this.controller.set('hasAside', !!opt.hasAside);
        this.controller.set('asideColor', opt.hasAside||'');
      }
    },

    // Raw message from the WebSocket
    wsMessage: function(/*data*/) {
      //console.log('wsMessage',data);
    },

    // WebSocket connected
    wsConnected: function(tries,msec) {
      var msg = 'WebSocket connected';
      if (tries > 0)
      {
        msg += ' (after '+ tries + ' ' + (tries === 1 ? 'try' : 'tries');
        if (msec)
        {
          msg += ', ' + (msec/1000) + ' sec';
        }

        msg += ')';
      }
      console.log(msg);
    },

    // WebSocket disconnected
    wsDisconnected: function() {
      console.log('WebSocket disconnected');
    },

    wsPing: function() {
      console.log('WebSocket ping');
    },

    /*
    agentChanged: function(change) {
      if (!change || !change.data || !change.data.resource)
      {
        return;
      }
      //console.log('Agent Changed:', change);
      var agent = change.data.resource;
      var id = agent.id;
      delete agent.hosts;

      var hosts = this.controllerFor('hosts');
      hosts.forEach(function(host) {
        if ( host.get('agent.id') === id )
        {
          host.get('agent').setProperties(agent);
        }
      });
    },
    */

    machineChanged: function(change) {
      console.log('Machine changed:',change);
    },

    hostChanged: function(change) {
      // If the host has a physicalHostId, ensure it is in the machine's hosts array.
      var host = change.data.resource;
      var machine = this.get('store').getById('machine', host.get('physicalHostId'));
      if ( machine )
      {
        machine.get('hosts').addObject(host);
      }
      console.log('Host changed:',change);
    },

    containerChanged: function(change) {
      this._includeChanged('host', 'instances', 'hosts', change.data.resource);
    },

    instanceChanged: function(change) {
      this._includeChanged('host', 'instances', 'hosts', change.data.resource);
    },

    ipAddressChanged: function(change) {
      this._includeChanged('host', 'ipAddresses', 'hosts', change.data.resource);
//      this._includeChanged('container', 'container', 'ipAddresses', 'containers', change.data.resource);
    },

    loadBalancerTargetChanged: function(change) {
      this._includeChanged('loadBalancer', 'loadBalancerTargets', 'loadBalancerId', change.data.resource);
    },

    loadBalancerConfigChanged: function(change) {
      this._includeChanged('loadBalancer', 'loadBalancerListeners', 'loadBalancerListeners', change.data.resource);
    },

    loadBalancerChanged: function(change) {
      var balancer = change.data.resource;
      var config = balancer.get('loadBalancerConfig');
      var balancers = config.get('loadBalancers');
      if ( !balancers )
      {
        balancers = [];
        config.set('loadBalancers',balancers);
      }

      if ( config.get('state') === 'removed' )
      {
        balancers.removeObject(balancer);
      }
      else
      {
        balancers.addObject(balancer);
      }
    },

    mountChanged: function(change) {
      var mount = change.data.resource;
      var volume = this.get('store').getById('volume', mount.get('volumeId'));
      if ( volume )
      {
        var mounts = volume.get('mounts');
        if ( !Ember.isArray('mounts') )
        {
          mounts = [];
          volume.set('mounts',mounts);
        }

        var existingMount = mounts.filterBy('id', mount.get('id')).get('firstObject');
        if ( existingMount )
        {
          existingMount.setProperties(mount);
        }
        else
        {
          mounts.pushObject(mount);
        }
      }
    },

    registryCredentialChanged: function(change) {
      // @TODO Change to registryId when the backend changes
      var key = 'registryId';
      if ( Object.keys(change.data.resource).indexOf(key) === -1 )
      {
        key = 'storagePoolId';
      }

      this._includeChanged('registry', 'credentials', key, change.data.resource);
    },

    serviceChanged: function(change) {
      this._includeChanged('environment', 'services', 'environmentId', change.data.resource);
    },
  },

  enter: function() {
    var store = this.get('store');
    var boundTypeify = store._typeify.bind(store);

    var url = "ws://"+window.location.host + this.get('app.wsEndpoint');
    var session = this.get('session');
    var jwt = session.get('jwt');
    if ( jwt )
    {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(jwt);
    }

    var projectId = session.get('projectId');
    if ( projectId )
    {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + 'projectId=' + encodeURIComponent(projectId);
    }

    var socket = Socket.create({
      url: url
    });

    socket.on('message', (event) => {
      var d = JSON.parse(event.data, boundTypeify);
      this._trySend('wsMessage',d);

      var str = d.name;
      if ( d.resourceType )
      {
        str += ' ' + d.resourceType;

        if ( d.resourceId )
        {
          str += ' ' + d.resourceId;
        }
      }

      var action;
      if ( d.name === 'resource.change' )
      {
        action = d.resourceType+'Changed';
      }
      else if ( d.name === 'ping' )
      {
        action = 'wsPing';
      }

      if ( action )
      {
        this._trySend(action,d);
      }
    });

    socket.on('connected', (tries, after) => {
      this._trySend('wsConnected', tries, after);
    });

    socket.on('disconnected', () => {
      this._trySend('wsDisconnected', this.get('tries'));
    });

    this.set('socket', socket);
    socket.connect();
  },

  exit: function() {
    var socket = this.get('socket');
    if ( socket )
    {
      socket.disconnect();
    }

    // Forget all the things
    this.get('store').reset();
  },

  _trySend: function(/*arguments*/) {
    try
    {
      this.send.apply(this,arguments);
    }
    catch (err)
    {
      if ( err instanceof Ember.Error && err.message.indexOf('Nothing handled the action') === 0 )
      {
        // Don't care
      }
      else
      {
        throw err;
      }
    }
  },


  // Update the `?include=`-ed arrays of a host,
  // e.g. when an instance changes:
  //   Update the destProperty='instances' array on all models of type resourceName='hosts'.
  //   to match the list in the the 'changed' resource's expectedProperty='hosts'
  // _includeChanged(       'host',       'hosts',        'instances', 'hosts',          instance)
  _includeChanged: function(resourceName, destProperty, expectedProperty, changed) {
    if (!changed)
    {
      return;
    }

    var changedId = changed.get('id');
    var store = this.get('store');

    //console.log('Include changed',resourceName,destProperty,expectedProperty,changedId);

    // All the resources
    var all = store.all(resourceName);

    // IDs the resource should be on
    var expectedIds = [];
    var expected = changed.get(expectedProperty)||[];
    if ( !Ember.isArray(expected) )
    {
      expected = [expected];
    }

    if ( changed.get('state') !== 'purged' )
    {
      expectedIds = expected.map(function(item) {
        if ( typeof item === 'object' )
        {
          return item.get('id');
        }
        else
        {
          return item;
        }
      });
    }

    // IDs it is currently on
    var curIds = [];
    all.forEach(function(item) {
      var existing = (item.get(destProperty)||[]).filterBy('id', changedId);
      if ( existing.length )
      {
        curIds.push(item.get('id'));
      }
    });

    // Remove from resources the changed shouldn't be on
    var remove = Util.arrayDiff(curIds, expectedIds);
    remove.forEach((id) => {
      //console.log('Remove',id);
      store.find(resourceName, id).then((item) => {
        var list = item.get(destProperty);
        if ( list )
        {
          //console.log('Removing',changedId,'from',item.get('id'));
          list.removeObjects(list.filterBy('id', changedId));
        }
      }).catch(() => {});
    });

    // Add or update resources the changed should be on
    expectedIds.forEach((id) => {
      //console.log('Expect',id);
      store.find(resourceName, id).then((item) => {
        var list = item.get(destProperty);
        if ( !list )
        {
          list = [];
          //console.log('Adding empty to',item.get('id'), destProperty);
          item.set(destProperty, list);
        }

        var existing = list.filterBy('id', changedId);
        if ( existing.length === 0)
        {
          //console.log('Adding',changedId,'to',item.get('id'), destProperty);
          list.pushObject(changed);
        }
      }).catch(() => {});
    });
  },
});
