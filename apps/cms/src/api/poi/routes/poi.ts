/**
 * poi router
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/pois',
      handler: 'poi.find',
      config: {
        auth: false
      }
    },
    {
      method: 'GET', 
      path: '/pois/:id',
      handler: 'poi.findOne',
      config: {
        auth: false
      }
    }
  ]
}
