const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());




const uri = "mongodb+srv://Phono:Cx7R7ECcpSmn2663@cluster0.v8gjvac.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {

    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.send(403).send('forbidden access');
        }
        req.decoded = decoded;
        next();
    })
}


async function run() {

    try {
        const mobileCollection = client.db('PhoneDB').collection('mobiles');
        const usersCollection = client.db('PhoneDB').collection('users');
        const purchasedCollection = client.db('PhoneDB').collection('purchased');
        const paymentCollection = client.db('PhoneDB').collection('payedList');
        const wishCollection = client.db('PhoneDB').collection('wishlist');



        app.post('/users', async (req, res) => {
            const query = req.body;
            const cursor = await usersCollection.insertOne(query)
            res.send(cursor)
        })

        app.post('/create-payment-intent', async (req, res) => {
            const payment = req.body;
            // console.log(payment);
            const price = payment.numberPrice;
            // console.log(price);
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: 'usd',
                amount: amount,
                payment_method_types: ['card'],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
            const id = payment.bookingId;

            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transitionId: payment.transitionId,
                },
            };
            const updatedResult = await purchasedCollection.updateOne(
                filter,
                updatedDoc,
            );

            const productId = req.body.productId;

            const query = { _id: ObjectId(productId) };

            const updatedProduct = {
                $set: {
                    status: 'sold',
                    ads: "disconnected",
                    save: 'dislike'
                },
            };
            const updatedProductResult = await mobileCollection.updateOne(
                query,
                updatedProduct,
            );

            res.send(result, updatedProductResult, updatedResult);
        });

        app.post('/payments-wish', async (req, res) => {
            const payment = req.body;
            const result = await paymentCollection.insertOne(payment);
          
            const updatedDoc = {
                $set: {
                    paid: true,
                },
            };
            const updatedResult = await mobileCollection.updateOne(
                updatedDoc,
            );
            const updatedProduct = {
                $set: {
                    status: 'sold',
                    ads: "disconnected",
                    save: 'dislike'
                },
            };
            
            const productId = req.body.productId;

            const query = { _id: ObjectId(productId) };

            const updatedProductResult = await mobileCollection.updateOne(
                query,
                updatedProduct,
            );

            res.send(result, updatedProductResult, updatedResult);
        });

        app.post('/mobiles', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const userQuery = { email: decodedEmail }
            const user = await usersCollection.findOne(userQuery);
            if (user.role !== 'Seller') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = req.body;
            const cursor = await mobileCollection.insertOne(query)
            res.send(cursor)
        })

        app.post('/purchased', async (req, res) => {
            const query = req.body;
            const cursor = await purchasedCollection.insertOne(query)
            res.send(cursor)
        })


        app.get('/jwt', async (req, res) => {
            const email = req.query.email
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '10h' })
                return res.send({ accessToken: token });

            }
            res.status(403).send({ accessToken: '' });
        })


        app.get('/bookings/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const booking = await purchasedCollection.findOne(query)
            res.send(booking);
        })


        app.get('/purchase-wish/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) }
            const booking = await mobileCollection.findOne(query)
            res.send(booking);
        })




        app.get('/mobiles', async (req, res) => {

            const category = req.query.category;
            const query = {
                $and: [{ category: category }, { status: 'available' }],
            }
            const products = await mobileCollection.find(query).toArray();
            res.send(products);
        });



        app.get('/user/:email', async (req, res) => {
            const email = req.params.email
            const query = { email: email }
            const result = await usersCollection.findOne(query)
            res.send(result)
        })

        app.get('/products', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;

            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { sellerEmail: email }
            const cursor = await mobileCollection.find(query).toArray();
            res.send(cursor)
        })

        app.get('/view-ads', async (req, res) => {
            const query = { ads: "connect" }
            const cursor = await mobileCollection.find(query).sort({ $natural: -1 }).toArray();
            res.send(cursor)
        })

        app.get('/buyerproducts', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { buyerEmail: email }
            const cursor = await purchasedCollection.find(query).toArray();
            res.send(cursor)
        })

        app.get('/get-buyers', verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            const query = { sellerEmail: email }
            const cursor = await purchasedCollection.find(query).toArray();
            res.send(cursor)
        })

        app.get('/users', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const queryRole = { email: decodedEmail }
            const checkRole = await usersCollection.findOne(queryRole);
            if (checkRole.role === 'Seller') {
                const query = { role: 'Buyer' }
                const cursor = await usersCollection.find(query).toArray();
                res.send(cursor)
            }
            else if (checkRole.role === 'Buyer') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const role = req.query.role;
            const query = { role: role }
            const cursor = await usersCollection.find(query).toArray();
            res.send(cursor)

        })

        

        app.put('/users/verified/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    checked: 'verified',
                }
            }

            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        app.put('/products/ads/:id', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'Seller') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true }
            const updatedDoc = {
                $set: {
                    ads: 'connect',
                }
            }

            const result = await mobileCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        })

        app.delete('/mobiles/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const result = await mobileCollection.deleteOne(query)
            res.send(result)
        })
        app.delete('/user/:id', async (req, res) => {
            const id = req.params.id
            const query = { _id: ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })

        app.post('/wishlist', async (req, res) => {
            
            // const wish = req.body;
            // const result = await wishCollection.insertOne(wish)
            // const id = wish.favProductId

            // const filter = { _id: ObjectId(id) }
            // const updateFav = {
            //     $set: {
            //         wish: 'love',
            //     },
            // }
            // const updatedFav = await purchasedCollection.updateOne(filter, updateFav)

            const productId = req.body.productNumber
            const favEmail = req.body.favEmail

            const query = {
                productNumber: productId
            }
            const updatedFavu = {
                $set: {
                    save: 'like',
                    favEmail: favEmail
                }
            }
            const updatedProductFav = await mobileCollection.updateOne(query, updatedFavu)
            res.send( updatedProductFav )


        })


        app.get('/wishlist', async (req, res) => {
            const email = req.query.email;
            const query = {
                $and: [{ favEmail: email }, { save: 'like' }],
            }
            const cursor = await mobileCollection.find(query).toArray();
            res.send(cursor)
        })


        // app.delete('/wishlist/:id', async (req, res) => {
        //     const id = req.params.id
        //     const query = { _id: ObjectId(id) }
        //     const result = await wishCollection.deleteOne(query)
        //     res.send(result)
        // })

    }
    finally {

    }
}


run().catch(err => console.error(err))




app.get('/', (req, res) => {
    res.send('Phono server is running');
})
app.listen(port, () => {
    console.log(`Running on port ${port}`);
})