require("dotenv").config();
const { ApolloServer, gql } = require("apollo-server-lambda");
const dynamoose = require("dynamoose");
const fetch = require("node-fetch");
const { v4 } = require("uuid");

const GOOGLE_TOKEN_INFO_BASE_URL =
  "https://www.googleapis.com/oauth2/v3/tokeninfo";

dynamoose.aws.sdk.config.update({
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
  region: "sa-east-1",
});

const DESAFIA_AI_MODEL = dynamoose.model(
  "DESAFIA_AI",
  new dynamoose.Schema(
    { PK: String, SK: String },
    {
      create: false,
      saveUnknown: true,
    }
  )
);

const getChallengeImage = (category) => {
  switch (category) {
    case "Internet das Coisas":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/IoT.svg";

    case "Desenvolvimento Web":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/webdev-prog.svg";

    case "Lógica de Programação":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/webdev-prog.svg";

    case "Machine Learning":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/machine-learning.svg";

    case "Ciência de Dados":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/datascience.svg";

    case "Redes":
      return "https://vitorflg-assets.s3-sa-east-1.amazonaws.com/rj45.svg";

    default:
      break;
  }
};

// Construct a schema, using GraphQL schema language
const typeDefs = gql`
  scalar JSON

  input UserInput {
    googleId: String!
    email: String!
    name: String
  }

  input SolutionInput {
    id: String
    challengeId: String!
    title: String!
    description: JSON!
    userGoogleId: String!
  }

  input ChallengeInput {
    id: String
    userGoogleId: String!
    name: String
    description: String
    tags: [JSON]
    category: String
    details: String
  }

  type Solution {
    challengeId: String
    title: String
    description: JSON
    likes: Int
    userGoogleId: String
  }

  type Challenge {
    id: String
    name: String
    description: String
    tags: [JSON]
    category: String
    imageUrl: String
    the_one: Boolean
    userGoogleId: String
    details: String
  }

  type User {
    googleId: String!
    email: String!
    name: String
  }

  type Query {
    theOne: Challenge
    hello: String
    ranking: [User]
    challenges(search: String, tags: [String], category: String): [Challenge]
    challenge(id: String!): Challenge
    solutions(challengeId: String): [Solution]
    currentUser: User
  }

  type Mutation {
    user(input: UserInput): User
    challenge(input: ChallengeInput): Int
    solution(input: SolutionInput): Int
  }
`;

// Provide resolver functions for your schema fields
const resolvers = {
  Query: {
    currentUser: async (_, __, context) => {
      const response = await fetch(
        `${GOOGLE_TOKEN_INFO_BASE_URL}?access_token=${context.headers.Authorization}`
      );

      const responseJSON = await response.json();

      if (response.status === 200) {
        const currentUser = await DESAFIA_AI_MODEL.scan({
          PK: { eq: `USER#${responseJSON.sub}` },
        }).exec();

        return {
          googleId: responseJSON.sub,
          name: currentUser[0].name,
          email: responseJSON.email,
        };
      } else {
        throw new Error("Unathorized: 403");
      }
    },
    solutions: async (_, { challengeId }) => {
      const solutions = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "SOLUTION#" },
        SK: { eq: `CHALLENGE#${challengeId}` },
      }).exec();

      return solutions.map((solution) => {
        return {
          challengeId: challengeId,
          title: solution.title,
          description: solution.description,
          likes: solution.likes,
          userGoogleId: solution.userGoogleId,
        };
      });
    },
    theOne: async () => {
      const theOne = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "CHALLENGE#" },
        the_one: { eq: true },
      }).exec();

      return {
        name: theOne[0].name,
        description: theOne[0].description,
        imageUrl: theOne[0].imageUrl,
      };
    },
    hello: async () => {
      return "Hello world!";
    },
    ranking: async () => {
      const users = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "USER#" },
      }).exec();

      return users.map((user, index) => {
        return {
          name: `${index + 1}. ${user.name}`,
        };
      });
    },
    challenges: async (_, { search, category, tags }) => {
      let scanParams = DESAFIA_AI_MODEL.scan("PK").contains("CHALLENGE#");

      if (search) {
        scanParams = scanParams.and().where("name").contains(search);
      }

      if (category) {
        scanParams = scanParams.and().where("category").eq(category);
      }

      if (tags) {
        tags.map((tag) => {
          scanParams = scanParams.and().where("tags").contains(tag);
        });
      }

      const challenges = await scanParams.exec();

      return challenges.map((challenge) => {
        return {
          id: challenge.id,
          name: challenge.name,
          description: challenge.description,
          imageUrl: challenge.imageUrl,
          category: challenge.category,
          tags: challenge.tags,
        };
      });
    },
    challenge: async (_, { id }) => {
      const challenge = await DESAFIA_AI_MODEL.scan({
        PK: { contains: "CHALLENGE#" },
        id: { eq: id },
      }).exec();

      return {
        id: challenge[0].id,
        details: challenge[0].details,
        name: challenge[0].name,
        description: challenge[0].description,
        userGoogleId: challenge[0].SK.split("#")[1],
        imageUrl: challenge[0].imageUrl,
        category: challenge[0].category,
        tags: challenge[0].tags,
      };
    },
  },
  Mutation: {
    user: async (_, { input }, context) => {
      const user = new DESAFIA_AI_MODEL({
        PK: `USER#${input.googleId}`,
        SK: `USER#${input.email}`,
        ...(input.name && { name: input.name }),
      });

      try {
        user.save();
      } catch {
        throw new Error("Unathorized: 403");
      }

      const response = await fetch(
        `${GOOGLE_TOKEN_INFO_BASE_URL}?access_token=${context.headers.Authorization}`
      );

      const responseJSON = await response.json();

      if (response.status === 200) {
        const currentUser = await DESAFIA_AI_MODEL.scan({
          PK: { eq: `USER#${responseJSON.sub}` },
        }).exec();

        return {
          googleId: responseJSON.sub,
          name: currentUser[0].name,
          email: responseJSON.email,
        };
      } else {
        throw new Error("Unathorized: 403");
      }
    },
    challenge: async (_, { input }, __) => {
      console.log(
        "🚀 ~ file: graphql.js ~ line 265 ~ challenge: ~ input",
        input
      );
      const challengeId = v4();

      const challenge = new DESAFIA_AI_MODEL({
        PK: `CHALLENGE#${input.name}`,
        SK: `USER#${input.userGoogleId}`,
        id: input.id ? input.id : challengeId,
        ...(input.name && { name: input.name }),
        ...(input.description && { description: input.description }),
        ...(input.category && { category: input.category }),
        ...(input.tags && { tags: input.tags }),
        ...(input.category && { imageUrl: getChallengeImage(input.category) }),
        ...(input.details && { details: input.details }),
      });

      try {
        challenge.save();

        return 200;
      } catch {
        throw new Error("Unathorized: 403");
      }
    },
    solution: async (_, { input }, __) => {
      const solutionId = v4();

      const solution = new DESAFIA_AI_MODEL({
        PK: `SOLUTION#${input.id ? input.id : solutionId}`,
        SK: `CHALLENGE#${input.challengeId}`,
        ...(input.title && { title: input.title }),
        ...(input.description && { description: input.description }),
        ...(input.likes && { likes: input.likes }),
        ...(input.userGoogleId && { userGoogleId: input.userGoogleId }),
      });

      try {
        solution.save();

        return 200;
      } catch {
        throw new Error("Unathorized: 403");
      }
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  playground: {
    endpoint: "/dev/graphql",
  },
  context: ({ event, context }) => ({
    headers: event.headers,
    functionName: context.functionName,
    event,
    context,
  }),
});

exports.graphqlHandler = server.createHandler({
  cors: {
    origin: "*",
    credentials: true,
  },
});
