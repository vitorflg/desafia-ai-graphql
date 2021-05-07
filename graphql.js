require('dotenv').config();
const { ApolloServer, gql } = require('apollo-server-lambda');
const dynamoose = require('dynamoose');
const fetch = require('node-fetch');
const { v4 } = require('uuid');

const GOOGLE_TOKEN_INFO_BASE_URL =
  'https://www.googleapis.com/oauth2/v3/tokeninfo';

dynamoose.aws.sdk.config.update({
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
  region: 'sa-east-1',
});

const DESAFIA_AI_MODEL = dynamoose.model(
  'DESAFIA_AI',
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
    case 'iot':
      return 'https://vitorflg-assets.s3-sa-east-1.amazonaws.com/IoT.svg';

    case 'dev-web':
      return 'https://vitorflg-assets.s3-sa-east-1.amazonaws.com/webdev-prog.svg';

    case 'logica-programacao':
      return 'https://vitorflg-assets.s3-sa-east-1.amazonaws.com/webdev-prog.svg';

    case 'machine-learning':
      return 'https://vitorflg-assets.s3-sa-east-1.amazonaws.com/machine-learning.svg';

    case 'ciencia-dados':
      return 'https://vitorflg-assets.s3-sa-east-1.amazonaws.com/datascience.svg';

    case 'redes':
      return 'https://vitorflg-assets.s3-sa-east-1.amazonaws.com/rj45.svg';

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

  input ChallengeInput {
    name: String
    description: String
    tags: [JSON]
    category: String
  }

  type Challenge {
    id: ID
    name: String
    description: String
    tags: [JSON]
    category: String
    imageUrl: String
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
  }

  type Mutation {
    user(input: UserInput): Number
    challenge(input: ChallengeInput): Number
  }
`;

// Provide resolver functions for your schema fields
const resolvers = {
  Query: {
    theOne: async () => {
      const theOne = await DESAFIA_AI_MODEL.scan({
        SK: { eq: 'CHALLENGE#THE_ONE' },
      }).exec();

      return {
        name: theOne[0].name,
        description: theOne[0].description,
        imageUrl: theOne[0].imageUrl,
      };
    },
    hello: async () => {
      return 'Hello world!';
    },
    ranking: async () => {
      const users = await DESAFIA_AI_MODEL.scan({
        PK: { contains: 'USER#' },
      }).exec();

      return users.map((user, index) => {
        return {
          name: `${index + 1}. ${user.name}`,
        };
      });
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
        throw new Error('403');
      }

      const response = await fetch(
        `${GOOGLE_TOKEN_INFO_BASE_URL}?access_token=${context.headers.Authorization}`
      );

      if (response.status === 200) {
        return 200;
      } else {
        throw new Error('Unathorized: 403');
      }
    },
    challenge: async (_, { input }, context) => {
      const challengeId = v4();
      const challenge = new DESAFIA_AI_MODEL({
        PK: `CHALLENGE#${challengeId}`,
        SK: `CHALLENGE#${challengeId}`,
        id: challengeId,
        ...(input.name && { name: input.name }),
        ...(input.description && { description: input.description }),
        ...(input.category && { categories: input.category }),
        ...(input.tags && { tags: input.tags }),
        ...(input.category && { imageUrl: getChallengeImage(input.category) }),
      });

      try {
        challenge.save();

        return 200;
      } catch {
        throw new Error('Unathorized: 403');
      }
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  playground: {
    endpoint: '/dev/graphql',
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
    origin: '*',
    credentials: true,
  },
});
