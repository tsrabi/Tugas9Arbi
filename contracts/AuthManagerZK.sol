// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AuthManagerZK {
    mapping(address => uint256) public userCommitments;
    mapping(address => bool) public loggedIn;

    event Registered(address indexed user, uint256 commitment);
    event LoggedIn(address indexed user);
    event LoggedOut(address indexed user);

    address public verifier;

    constructor(address _verifier) {
        verifier = _verifier;
    }

    function setVerifier(address _verifier) external {
        require(msg.sender == owner(), "only owner");
        verifier = _verifier;
    }

    function owner() public view returns (address) {
        return msg.sender;
    }

    function register(uint256 _commitment) public {
        require(userCommitments[msg.sender] == 0, "already registered");
        userCommitments[msg.sender] = _commitment;
        emit Registered(msg.sender, _commitment);
    }

    function login(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[1] calldata input
    ) public returns (bool) {
        require(userCommitments[msg.sender] != 0, "user not registered");
        require(IVerifier(verifier).verifyProof(a, b, c, input), "invalid proof");
        loggedIn[msg.sender] = true;
        emit LoggedIn(msg.sender);
        return true;
    }

    function logout() public {
        loggedIn[msg.sender] = false;
        emit LoggedOut(msg.sender);
    }
}

interface IVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[1] calldata input
    ) external view returns (bool);
}
