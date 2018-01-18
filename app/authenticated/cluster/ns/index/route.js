import { inject as service } from '@ember/service';
import { hash } from 'rsvp';
import { get } from '@ember/object'
import Route from '@ember/routing/route';

export default Route.extend({
  scope: service(),

  model() {
    let cluster = get(this, 'scope.currentCluster');

    if ( get(cluster,'state') !== 'active' ) {
      this.transitionTo('authenticated.cluster.index');
    }

    return hash({
      namespaces: get(this, 'clusterStore').findAll('namespace'),
      projects: get(this, 'globalStore').findAll('project'),
    });
  },
});