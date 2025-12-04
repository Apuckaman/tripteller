/**
 * poi2 router
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/poi2s',
      handler: 'poi2.find',
      config: {
        auth: false
      }
    },
    {
      method: 'GET', 
      path: '/poi2s/:id',
      handler: 'poi2.findOne',
      config: {
        auth: false
      }
    }
  ]
}


