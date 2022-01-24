const express = require('express');
const axios = require('axios');
const lqip = require('lqip');
const crypto = require('crypto');
const qs = require('qs');
const fs = require('fs');
const ig = require('instagram-scraping');
const mailgun = require('mailgun-js');
const stripe = require('stripe')(process.env.STRIPE_KEY);
const orderid = require('order-id')(process.env.STRAPI_KEY);
const {MessageEmbed} = require('discord.js');
const Mixpanel = require('mixpanel');
const router = express.Router();

mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);
const mg = mailgun({apiKey: process.env.MAILGUN_KEY, domain: 'relay.brandondiaz.me'});

/* GET home page. */
router.get('/', function (req, res, next) {
    res.redirect('https://brandondiaz.me');
});

router.get('/feed/instagram', function (req, res, next) {
    if (cache.instagram) {
        res.json({
            feed: cache.instagram,
            cache: true,
            success: true
        });
    } else {
        ig.scrapeUserPage('brandon_diaz').then((feed) => {
            res.json({
                feed: feed,
                cache: false,
                success: true
            });

            cache.instagram = feed;
            fs.writeFile('cache-instagram.json', JSON.stringify(feed, null, 2), (err) => {
                if (err) throw err;
                console.log('Data written to file');
            });
        }).catch(err => {
            console.log('Error: ', err.message);
            res.json({
                success: false
            });
        });
    }
});

router.get('/me', function (req, res, next) {
    axios.get('http://localhost:1337/api/users/me', {
        headers: {
            'Authorization': req.headers['authorization']
        }
    }).then(user => {
        let query = {
            filters: {
                email: {
                    $eq: user.data.email
                }
            }
        };

        query = qs.stringify(query, {
            encodeValuesOnly: true,
        });

        axios.get('http://localhost:1337/api/patrons?' + query, {
            headers: {
                'Authorization': 'Bearer ' + process.env.STRAPI_KEY
            }
        }).then(result => {
            if (result.data.data.length && result.data.data[0].attributes.Email == user.data.email) {
                user.data.patron = true;
            } else {
                user.data.patron = false;
            }

            mixpanel.people.set(user.data.id, {
                $email: user.data.email,
                $name: user.data.Name
            });

            res.json(user.data);
        }).catch(err => {
            console.log('Error: ', err.message);
            res.json({});
        });
    }).catch(err => {
        console.log('Error: ', err.message);
        res.json({});
    });
});

router.post('/signin', function (req, res) {
    axios.post('http://localhost:1337/api/auth/local', {
        identifier: req.body.email,
        password: req.body.pass,
    }, {
        headers: {
            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
        }
    }).then(result => {
        res.json({
            success: true,
            token: result.data.jwt
        });
    }).catch(err => {
        console.log('Error: ', err.message);
        res.status(400).json({
            success: false
        });
    });
});

router.post('/signup', function (req, res) {
    axios.post('http://localhost:1337/api/auth/local/register', {
        username: req.body.email,
        email: req.body.email,
        password: req.body.pass,
        Name: req.body.name,
    }, {
        headers: {
            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
        }
    }).then(result => {
        res.json({
            success: true,
            token: result.data.jwt
        });
    }).catch(err => {
        console.log('Error: ', err.message);
        res.status(400).json({
            success: false
        });
    });
});

router.post('/reserve', function (req, res) {
    axios.post('http://localhost:1337/api/reservations', {
        data: {
            Email: req.body.params.email,
            Config: req.body.config,
        }
    }, {
        headers: {
            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
        }
    }).then(result => {
        res.json({
            success: true
        });
    }).catch(err => {
        console.log('Error: ', err.response.data);
        res.status(400).json({
            success: false
        });
    });
});

router.post('/watch', function (req, res) {
    axios.post('http://localhost:1337/api/watchers', {
        Email: req.body.params.email,
        SKU: req.body.sku,
    }, {
        headers: {
            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
        }
    }).then(result => {
        res.json({
            success: true
        });
    }).catch(err => {
        console.log('Error: ', err.message);
        res.status(400).json({
            success: false
        });
    });
});

router.get('/orders/:id', function (req, res, next) {
    let query = {
        filters: {
            UID: {
                $eq: req.params.id
            }
        },
        populate: {
            Picklist: {
                populate: '*'
            }
        }
    };

    query = qs.stringify(query, {
        encodeValuesOnly: true,
    });

    axios.get('http://localhost:1337/api/orders?' + query, {
        headers: {
            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
        }
    }).then(result => {
        const order = result.data;
        const summaries = {
            'Pending' : 'Your order is pending, and your payment is currently being processed.',
            'Confirmed' : 'Your payment has been processed, and your order is now being prepared to ship.',
            'Printing' : '',
            'Building' : '',
            'OnHold' : '',
            'Testing' : '',
            'Shipped' : '',
            'Delivered' : '',
            'Cancelled' : '',
            'Refunded' : '',
        };

        if (order.data) {
            delete order.data[0].attributes.CustomerEmail;
            order.data[0].attributes.Summary = summaries[order.data[0].attributes.Status];
        }

        res.json(order);
    }).catch(err => {
        console.log('Error: ', err.message);
        res.json({});
    });
});

router.get('/orders', function (req, res, next) {
    axios.get('http://localhost:1337/api/users/me', {
        headers: {
            'Authorization': req.headers['authorization']
        }
    }).then(user => {
        let query = {
            filters: {
                CustomerEmail: {
                    $eq: user.data.email
                }
            }
        };

        query = qs.stringify(query, {
            encodeValuesOnly: true,
        });

        axios.get('http://localhost:1337/api/orders?' + query, {
            headers: {
                'Authorization': 'Bearer ' + process.env.STRAPI_KEY
            }
        }).then(result => {
            res.json({orders: result.data});
        }).catch(err => {
            console.log('Error: ', err.message);
            res.json({});
        });
    }).catch(err => {
        console.log('Error: ', err.message);
        res.json({});
    });
});

router.get('/checkout', async (req, res) => {
    let lineItems = [];
    let metaItems = [];
    let totalWeight = 0;
    let cartItems = JSON.parse(req.query.cart);
    let user = {data: {}};

    try {
        user = await axios.get('http://localhost:1337/api/users/me', {
            headers: {
                'Authorization': 'Bearer ' + req.query.token || ''
            }
        });

        let query = {
            filters: {
                email: {
                    $eq: user.data.email
                }
            }
        };

        query = qs.stringify(query, {
            encodeValuesOnly: true,
        });

        let patron = await axios.get('http://localhost:1337/api/patrons?' + query, {
            headers: {
                'Authorization': 'Bearer ' + process.env.STRAPI_KEY
            }
        });
        if (patron.data.data.length && patron.data.data[0].attributes.Email == user.data.email) {
            user.data.patron = true;
        } else {
            user.data.patron = false;
        }
    } catch (error) {
    }

    for (const item of cartItems) {
        let product = await axios.get('http://localhost:1337/api/products/' + item.id + '?populate[Options][populate]=*', {
            headers: {
                'Authorization': 'Bearer ' + process.env.STRAPI_KEY
            }
        });

        let price = 0;
        let weight = 0;
        let selectedOption = null;

        product.data.data.attributes.Options.forEach((option) => {
            if (option.SKU == item.option) {
                selectedOption = option;
                price = option.Price;
                weight = option.Weight * item.quantity;
            }
        });

        if (price) {
            let discount = false;

            if (user.data.patron) {
                price -= Math.round(((price * 0.05) + Number.EPSILON) * 100) / 100;
                discount = true;
            }

            totalWeight += weight;

            metaItems.push({
                id:product.data.data.id,
                quantity:item.quantity,
                option:item.option,
                price: price,
                discounted: discount
            });

            lineItems.push(
                {
                    price_data: {
                        currency: 'USD',
                        unit_amount: Math.floor(price * 100),
                        tax_behavior: 'inclusive',
                        product_data: {
                            name: product.data.data.attributes.Name,
                            description: item.option,
                            metadata: {
                                id: product.data.data.id,
                                sku: item.option
                            }
                        }
                    },
                    adjustable_quantity: {
                        enabled: !!selectedOption.Stock,
                        minimum: 1,
                        maximum: Math.max(selectedOption.Stock, item.quantity)
                    },
                    quantity: item.quantity,
                }
            );
        }
    }

    const rates = [
        3.86,
        3.86,
        3.86,
        3.86,
        4.15,
        4.15,
        4.15,
        4.15,
        4.98,
        4.98,
        4.98,
        4.98,
        6.28
    ];

    let shipping = 0;
    if (totalWeight) {
        shipping += rates[(totalWeight % rates.length) - 1] || 0;
        shipping += (rates[rates.length - 1] * (Math.floor(totalWeight / rates.length)));

        if (!shipping && totalWeight) {
            shipping = rates[0];
        }

        shipping *= 100;
    }

    const session = await stripe.checkout.sessions.create({
        customer_email: user.data ? user.data.email : null,
        client_reference_id: user.data ? user.data.id : null,
        metadata: {
            customer: JSON.stringify(user.data),
            cart: JSON.stringify(metaItems)
        },
        submit_type: 'auto',
        phone_number_collection: {
            enabled: false
        },
        billing_address_collection: 'auto',
        shipping_address_collection: {
            allowed_countries: ['US', 'CA'],
        },
        shipping_options: [
            {
                shipping_rate_data: {
                    type: 'fixed_amount',
                    tax_behavior: 'exclusive',
                    fixed_amount: {
                        amount: shipping,
                        currency: 'usd',
                    },
                    display_name: (shipping ? 'USPS First-Class' : 'Free Shipping'),
                    delivery_estimate: {
                        minimum: {
                            unit: 'business_day',
                            value: 5,
                        },
                        maximum: {
                            unit: 'business_day',
                            value: 7,
                        },
                    }
                }
            }
        ],
        line_items: lineItems,
        mode: 'payment',
        success_url: `https://api.brandondiaz.me/checkout/success/{CHECKOUT_SESSION_ID}`,
        cancel_url: `https://brandondiaz.me`,
        automatic_tax: {enabled: true},
    });

    res.redirect(303, session.url);
});

router.get('/checkout/success/:id', async (req, res) => {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    let items = JSON.parse(session.metadata.cart);
    let id = orderid.generate();
    let picklist = [];
    let order = {
        UID: id,
        CustomerEmail: session.customer_details.email,
        Total: session.amount_total / 100,
        Destination: {
            Recipient: session.shipping.name,
            Street: session.shipping.address.line1,
            Unit: session.shipping.address.line2,
            City: session.shipping.address.city,
            State: session.shipping.address.state,
            Zip: session.shipping.address.postal_code,
            Country: session.shipping.address.country
        },
        Stripe: {
            SessionID: session.id,
            PaymentID: session.payment_intent,
            CustomerID: session.customer,
        }
    };

    mg.messages().send({
        from: 'Brandon Diaz <store@brandondiaz.me>',
        to: 'hello@brandondiaz.me',
        subject: 'New Order',
        text: 'You have a new order from ' + session.customer_details.email + ' for $' + (session.amount_total / 100) + ' USD.'
    });

    if (session.client_reference_id) {
        order.Customer = parseInt(session.client_reference_id);
        mixpanel.people.set(session.client_reference_id);
    }

    mixpanel.track('Customer:Checkout:Completed', {
        Total: session.amount_total / 100
    })

    items.forEach((item) => {
        picklist.push({
            product: parseInt(item.id),
            SKU: item.option,
            Quantity: item.quantity,
            Price: item.price,
            Discounted: item.discounted
        });
    });

    order.Picklist = picklist;

    axios.post('http://localhost:1337/api/orders', {
        data: order
    }, {
        headers: {
            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
        }
    }).then(result => {
        res.redirect('https://brandondiaz.me/order/' + result.data.data.attributes.UID + '/#confirmation')
    }).catch(err => {
        console.log('Error: ', err.message, err.response);
        res.status(400).json({
            success: false
        });
    });
});

router.get('/products/:slug', function (req, res, next) {
    let query = {
        filters: {
            slug: {
                $eq: req.params.slug
            }
        },
        populate: {
            'agreements': {
                populate: '*'
            },
            'designers': {
                populate: '*'
            },
            'categories': {
                populate: '*'
            },
            'Options': {
                populate: '*'
            },
            'Photos': {
                populate: '*'
            },
            'Features': {
                populate: '*'
            },
            'Specifications': {
                populate: '*'
            },
            'SEO':{
                populate: '*'
            }
        }
    };

    query = qs.stringify(query, {
        encodeValuesOnly: true,
    });

    axios.get('http://localhost:1337/api/products?' + query, {
        headers: {
            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
        }
    }).then(result => {
        const product = result.data;
        res.json(product);
    }).catch(err => {
        console.log('Error: ', err.message);
        res.json({});
    });
});

router.get('/products', function (req, res, next) {
    let query = {
        filters: {},
        pagination: {
            'page': req.query.page || 1,
            'pageSize': req.query.count || 0
        },
        populate: {
            'agreements': '*',
            'designers': '*',
            'categories': '*',
            'Options': {
                populate: '*'
            }
        }
    };

    if (req.query.category) {
        query.filters.categories = {
            slug: {
                $eq: req.query.category
            }
        }
    }

    query = qs.stringify(query, {
        encodeValuesOnly: true,
    });

    axios.get('http://localhost:1337/api/products?' + query, {
        headers: {
            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
        }
    }).then(result => {
        const products = result.data;
        res.json(products);
    }).catch(err => {
        console.log('Error: ', err.message);
        res.json({});
    });
});

router.post('/webhook/lqip', function (req, res, next) {
    console.log('HOOK', req.header('x-strapi-signature'), req.body);

    if (req.header('x-strapi-signature') != process.env.STRAPI_SIGNATURE) {
        res.status(400).json({
            message: 'Invalid Signature'
        });

        return false;
    }

    switch (req.body.event) {
        case 'media.create':
        case 'media.update':
            let file = '/var/www/db/public' + req.body.media.url;

            lqip.base64(file).then(encoded => {
                const buffer = Buffer.from(encoded.replace('data:' + req.body.media.mime + ';base64,', ''), 'base64');
                fs.writeFile('/var/www/db/public/uploads/' + req.body.media.hash + '.lqip' + req.body.media.ext, buffer, function (err) {
                    if (err) {
                        console.log('LQIP ERROR', err);
                        res.status(400).json({message: err});
                    } else {
                        res.json({success: true});
                    }
                });
            });
            break;
    }
});

router.post('/webhook/patreon', function (req, res, next) {
    const hash = crypto
        .createHmac('md5', process.env.PATREON_SIGNATURE)
        .update(req.rawBody)
        .digest('hex');
    const secure = req.header('x-patreon-signature') === hash;
    let query = null;

    console.log('PATREON', secure, hash, '-', req.header('x-patreon-signature'), req.header('x-patreon-event'), req.body.data);

    if (!secure) {
        // res.status(401).json({
        //     success: false
        // });
        // return false;
    }

    switch (req.header('x-patreon-event')) {
        case 'posts:publish':
            let type = 'post';
            const message = new MessageEmbed()
                .setColor(0xff424d)
                .setTitle(req.body.data.attributes.title)
                .setAuthor(
                    'Brandon Diaz',
                    'https://yt3.ggpht.com/ZUdSB1mcKCruglc9f7KnYOmxHz6SNdriGNGM4CCLo4XMuCALMSpXMdS2d6oCTwsaCwksI-VsNg=s176-c-k-c0x00ffffff-no-rj',
                    'https://www.patreon.com/brandondiaz')
                .setURL('https://www.patreon.com' + req.body.data.attributes.url);

            if (req.body.data.attributes.embed_data) {
                if (req.body.data.attributes.embed_data.provider == 'YouTube') {
                    const video = req.body.data.attributes.embed_url.split('?v=')[1];
                    message.setImage('https://img.youtube.com/vi/' + video + '/maxresdefault.jpg');
                    type = 'video';
                }
            }

            global.discord.channels.cache.get('844340085922463754').send({
                content: 'Hey everyone, a new Patreon-exlusive ' + type + ' just went up!',
                embeds: [message]
            });

            res.json({
                success: true
            });
            break;
        case 'members:pledge:create':
            query = {
                filters: {
                    email: {
                        $eq: req.body.data.attributes.email
                    }
                }
            };

            query = qs.stringify(query, {
                encodeValuesOnly: true,
            });

            axios.get('http://localhost:1337/api/patrons?' + query, {
                headers: {
                    'Authorization': 'Bearer ' + process.env.STRAPI_KEY
                }
            }).then(result => {
                if (result.data.data.length && result.data.data[0].attributes.Email == req.body.data.attributes.email) {
                    console.log('PATRON ALREADY EXISTS');
                    res.json({
                        success: true
                    });
                } else {
                    axios.post('http://localhost:1337/api/patrons', {
                        data: {
                            Email: req.body.data.attributes.email,
                            Name: req.body.data.attributes.full_name
                        }
                    }, {
                        headers: {
                            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
                        }
                    }).then(result => {
                        res.json({
                            success: true
                        });
                    }).catch(err => {
                        console.log('Error: ', err.message);
                        res.status(400).json({
                            success: false
                        });
                    });
                }
            }).catch(err => {
                console.log('Error: ', err.message);
                res.json({});
            });

            break;
        case 'members:pledge:delete':
            console.log('MEMBER', req.body.data.attributes.email);
            query = {
                filters: {
                    Email: {
                        $eq: req.body.data.attributes.email
                    }
                },
            };

            query = qs.stringify(query, {
                encodeValuesOnly: true,
            });

            axios.get('http://localhost:1337/api/patrons?' + query, {
                headers: {
                    'Authorization': 'Bearer ' + process.env.STRAPI_KEY
                }
            }).then(result => {
                if (result.data && result.data.data) {
                    let user = result.data.data[0];
                    axios.delete('http://localhost:1337/api/patrons/' + user.id, {
                        headers: {
                            'Authorization': 'Bearer ' + process.env.STRAPI_KEY
                        }
                    }).then(result => {
                        res.json({
                            success: true
                        });
                    }).catch(err => {
                        console.log('Error: ', err.message);
                        res.status(400).json({
                            success: false
                        });
                    });
                }
            }).catch(err => {
                console.log('Error: ', err.message);
                res.status(400).json({
                    success: false
                });
            });
            break;
        default:
            res.json({
                success: true
            });
            break;
    }
});

router.get('/webhook/instagram', function(req, res){
    ig.scrapeUserPage('brandon_diaz').then((feed) => {
        res.json({
            feed: feed,
            cache: false,
            success: true
        });

        cache.instagram = feed;
        fs.writeFile('cache-instagram.json', JSON.stringify(feed, null, 2), (err) => {
            if (err) throw err;
            console.log('Data written to file');
        });
    }).catch(err => {
        console.log('Error: ', err.message);
        res.json({
            success: false
        });
    });
});

router.post('/webhook/stripe', async function (req, res) {
    const signature = req.headers['stripe-signature'];
    let event = null;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, signature, process.env.STRIPE_HOOK_SECRET);
    } catch (err) {
        console.log('ERR', err);
        res.status(401).end();
        return;
    }

    let query = null;
    let order = null;

    // event.data.object
    switch (event.type) {
        case 'checkout.session.expired':
            // Then define and call a function to handle the event checkout.session.expired
            break;
        case 'charge.succeeded':
            query = {
                filters: {
                    Stripe: {
                        PaymentID: event.data.object.payment_intent
                    }
                },
                populate: '*'
            };

            query = qs.stringify(query, {
                encodeValuesOnly: true,
            });

            order = await axios.get('http://localhost:1337/api/orders?' + query, {
                headers: {
                    'Authorization': 'Bearer ' + process.env.STRAPI_KEY
                }
            });

            order = order.data.data[0];

            if (!order) {
                res.status(400).end();
                return;
            }

            // if (order.attributes.Customer && order.attributes.Customer.data) {
            //     console.log('TRACKING CHARGE', order.attributes.Total, typeof order.attributes.Total);
            //     mixpanel.people.set(order.attributes.Customer.data.id);
            //     mixpanel.people.track_charge(order.attributes.Total);
            // }

            await axios.put('http://localhost:1337/api/orders/' + order.id, {
                data: {
                    Status: 'Confirmed',
                    Stripe: {
                        SessionID: order.attributes.Stripe.SessionID,
                        PaymentID: order.attributes.Stripe.PaymentID,
                        CustomerID: order.attributes.Stripe.CustomerID,
                        Status: 'Complete'
                    }
                }
            }, {
                headers: {
                    'Authorization': 'Bearer ' + process.env.STRAPI_KEY
                }
            });

            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.sendStatus(200);
});

module.exports = router;
