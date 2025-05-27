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
    ],
  };