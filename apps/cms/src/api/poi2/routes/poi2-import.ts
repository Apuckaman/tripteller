/**
 * POI2 CSV Import Routes
 */

export default {
  routes: [
    {
      method: 'POST',
      path: '/poi2-import',
      handler: 'poi2-import.import',
      config: {
        auth: false, // Will be handled by admin authentication in controller if needed
        policies: [],
        middlewares: []
      }
    }
  ]
};

