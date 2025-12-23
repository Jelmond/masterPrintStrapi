export default {
    routes: [
      {
        method: "GET",
        path: "/getSimilarProducts/:id",
        handler: "get-similar-products.getSimilarProducts",
        // config: {
        //   policies: ["global::is-authenticated"],
        // },
      },
      {
        method: "GET",
        path: "/search",
        handler: "search.search",
        config: {
          policies: [],
          middlewares: [],
        },
      },
      {
        method: "GET",
        path: "/bestsellers",
        handler: "bestsellers.find",
        config: {
          policies: [],
          middlewares: [],
        },
      },
    ],
  };