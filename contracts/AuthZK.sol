// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AuthZK {
    struct UserData {
        string username;
        uint256 commitment;
        bool exists;
    }

    address public owner;
    mapping(address => UserData) public users;
    mapping(address => bool) public loggedIn;

    event UserRegistered(address indexed user, string username, uint256 commitment);
    event UserLoggedIn(address indexed user);
    event UserLoggedOut(address indexed user);

    // Minimal verifier interface for Groth16 proofs
    address public verifier;

    constructor(address _verifier) {
        owner = msg.sender;
        verifier = _verifier;
    }

    function setVerifier(address _verifier) external {
        require(msg.sender == owner, "only owner");
        verifier = _verifier;
    }

    function register(string memory _username, uint256 _commitment) public {
        require(!users[msg.sender].exists, "already registered");
        users[msg.sender] = UserData({
            username: _username,
            commitment: _commitment,
            exists: true
        });
        emit UserRegistered(msg.sender, _username, _commitment);
    }

    function login(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[1] calldata input
    ) public returns (bool) {
        require(users[msg.sender].exists, "user not registered");
        require(IVerifier(verifier).verifyProof(a, b, c, input), "invalid proof");
        loggedIn[msg.sender] = true;
        emit UserLoggedIn(msg.sender);
        return true;
    }

    function logout() public {
        loggedIn[msg.sender] = false;
        emit UserLoggedOut(msg.sender);
    }

    function getUsername(address _user) public view returns (string memory) {
        return users[_user].username;
    }

    function isLoggedIn(address _user) public view returns (bool) {
        return loggedIn[_user];
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
