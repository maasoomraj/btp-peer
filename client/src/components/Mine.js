import React, { Component } from 'react';
import axios from 'axios';
import Navigation from './Navigation';

class Minedata extends Component {
    constructor(props) {
        super(props)

        this.state = {
            mines: []
        }
    }

    componentDidMount() {
        axios.get('http://localhost:3001/api/mine-transactions')
        .then(response => {
            console.log(response)
            this.setState({mines:response.data})
        })
    }

    render() {
        const { mines } = this.state
        return(
            <div className='body'>
                <Navigation />
                { JSON.stringify(mines) }
            </div>
        );
    }
}

export default Minedata;