const fs = require('fs');
const path = require('path');

const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const sendgridTransport = require('nodemailer-sendgrid-transport');

const Product = require('../models/product');
const Order = require('../models/order');
const User = require('../models/user');

const transporter = nodemailer.createTransport(
  sendgridTransport({
    auth: {
      api_key:
        // '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'
        ''
    }
  })
);

const ITEMS_PER_PAGE = 2;

exports.getProducts = (req, res, next) => {
  const page = +req.query.page || 1;
  let totalItems;

  Product.find()
    .countDocuments()
    .then(numProducts => {
      totalItems = numProducts;
      return Product.find()
        
    })
    .then(products => {
      res.render('shop/product-list', {
        prods: products,
        pageTitle: 'Products',
        path: '/products',
        currentPage: page
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then(product => {
      res.render('shop/product-detail', {
        product: product,
        pageTitle: product.title,
        path: '/products'
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getIndex = (req, res, next) => {
  const page = +req.query.page || 1;
  let totalItems;

  Product.find()
    .countDocuments()
    .then(numProducts => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then(products => {
      res.render('shop/index', {
        prods: products,
        pageTitle: 'Shop',
        path: '/'
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCart = (req, res, next) => {
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items;
      res.render('shop/cart', {
        path: '/cart',
        pageTitle: 'Your Cart',
        products: products
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then(product => {
      return req.user.addToCart(product);
    })
    .then(result => {
      console.log(result);
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then(result => {
      console.log(result);
      res.redirect('/cart');
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.postOrder = (req, res, next) => {
  let orderId;
  console.log("Params",req.body)
  req.user
    .populate('cart.items.productId')
    .execPopulate()
    .then(user => {
      const products = user.cart.items.map(i => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user,
          cellNumber: req.user.cellNumber,
          address: req.user.address,
        },
        products: products
      });
      return order.save();
    })
    .then(order => {
      orderId = order._id;
      return req.user.clearCart();
    })
    .then((result) => {
      res.redirect('/orders');
      console.log(orderId);
      transporter.sendMail({
        to: 'macvu1@gmail.com',
        from: 'hiring@savunaonline.co.za',
        subject: 'New Order from Savuna!',
        html: `Please click on the link to view the order <a href="http://localhost:2300/orders/${orderId}">Invoice</a>`
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ 'user.userId': req.user._id })
    .then(orders => {
      res.render('shop/orders', {
        path: '/orders',
        pageTitle: 'Your Orders',
        orders: orders
      });
    })
    .catch(err => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findById(orderId)
    .then(order => {
      console.log('1st');
      return order.populate('user.userId')
        .execPopulate();
    }).then(order => {
      const order2 = order.user.userId;
      console.log('2nd', order)
      if (!order) {
        return next(new Error('No order found.'));
      }
      if (order.user.userId.id.toString() !== req.user._id.toString()) {
        return next(new Error('Unauthorized'));
      }
      const invoiceName = 'invoice-' + orderId + '.pdf';
      const invoicePath = path.join('data', 'invoices', invoiceName);

      const pdfDoc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'inline; filename="' + invoiceName + '"'
      );
      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);
      pdfDoc.fontSize(26).text('Savuna Hiring Service Invoice', {
        underline: true
      });
      pdfDoc.text('-----------------------');
      let totalPrice = 0;
      order.products.forEach(prod => {
        totalPrice += prod.quantity * prod.product.price;
        pdfDoc
          .fontSize(14)
          .text(
            prod.product.title +
              ' - ' +
              prod.quantity +
              ' x ' +
              'R' +
              prod.product.price.toFixed(2)
          );
      });
      pdfDoc.text('---------------------------');
      pdfDoc.text();
      pdfDoc.text();
      pdfDoc.fontSize(20).text('Total Price: R' + totalPrice.toFixed(2));
      pdfDoc.text()
      pdfDoc.text('---------------------------');
      pdfDoc.text();
      pdfDoc.text('Address: \n');
      pdfDoc.fontSize(10).text(order2.address.replace(/\r/g, ' '));
      pdfDoc.text()
      pdfDoc.fontSize(20).text('---------------------------');
      pdfDoc.fontSize(20).text('Cell No: ');
      pdfDoc.fontSize(10).text(order2.cellNumber);
      pdfDoc.text('\n\n\n\n\n\n\n\n\n\n');
      pdfDoc.text('Please Note:\n The maximum number of days for hire on a weekend is 2: (Saturday till Sunday if the products are delivered on a Friday)\n');
      pdfDoc.text('And (Sunday till Monday morning if the products are delivered on a Saturday). If it is weekday hire, then the maximum is 1 day (Will be delivered and collected on the same day).');
      pdfDoc.end();
    })
    .catch(err => next(err));
};
