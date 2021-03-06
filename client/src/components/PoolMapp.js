import React, { Component } from "react";
import Navigation from "./common/Navigation";
import { Redirect } from "react-router-dom";

class PoolMap extends Component {
  constructor(props) {
    super(props);

    this.state = {
      transactionPool: {},
      isLoggedIn: true,
    };
  }

  componentDidMount() {
    fetch(
      window.location.protocol +
        "//" +
        window.location.hostname +
        ":" +
        window.location.port +
        "/api/transactionPoolMap"
    )
      .then((response) => response.json())
      .then((json) =>
        this.setState({
          transactionPool: json.transactionPool,
          isLoggedIn: json.isLoggedIn,
        })
      );
    console.log("trans - " + this.state.isLoggedIn);
  }

  render() {
    const { transactionPool, isLoggedIn } = this.state;
    console.log(transactionPool);
    const transactions = Object.values(this.state.transactionPool);
    if (isLoggedIn === false) {
      return <Redirect to="/"></Redirect>;
    } else {
      return (
        <div>
          <Navigation />
          <div className="Block">
            <br></br>
            {transactions.map((transaction) => {
              return (
                <div>
                  <p className="walletInfoText">
                    Id - {transaction.id} <br />
                    Product - {transaction.input.product} <br />
                    Quantity - {transaction.input.quantity}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  }
}

export default PoolMap;
